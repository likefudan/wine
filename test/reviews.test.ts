import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { aromaIds, cleanScore, parseImport, reviewPrompt, searchLinks } from "../src/shared/reviews";
import { DAILY_REVIEW_LIMIT, type LookupAnswer, reviewDeps, verify } from "../src/worker/reviews";
import { signIn, vintageOp } from "./helpers";

const SOURCES = [
  "https://www.wine.com/product/opus-one-2019/123",
  "https://www.cellartracker.com/wine.asp?iWine=4100000",
  "https://www.wine-searcher.com/find/opus+one+napa+valley/2019",
];

const answer = (over: Record<string, unknown> = {}): LookupAnswer => ({
  urls: SOURCES,
  usage: { input: 70000, output: 2000, searches: 4 },
  json: {
    critic_scores: [
      {
        publication: "Wine Advocate",
        reviewer: "William Kelley",
        score: "97–99",
        source_url: "https://wine.com/product/opus-one-2019/123/",
        evidence: "Wine Advocate 97-99 points",
      },
      // Its page was never in the search results: dropped.
      {
        publication: "James Suckling",
        reviewer: null,
        score: "99",
        source_url: "https://example.com/made-up",
        evidence: "99 points",
      },
      // The quote does not show the number: dropped.
      {
        publication: "Vinous",
        reviewer: "Antonio Galloni",
        score: "97",
        source_url: SOURCES[0],
        evidence: "a stunning wine",
      },
    ],
    community: { avg: 93.14, count: 59, source_url: SOURCES[1] },
    price_usd: { avg: 461.4, source_url: SOURCES[2] },
    drink_window: "2027-2050",
    aromas: ["blackcurrant", "cedar", "not-a-word", "cedar"],
    summary: { zh: "一款结构严谨的纳帕混酿。", tw: "一款結構嚴謹的納帕混釀。", en: "A tightly built Napa blend." },
    pages: { wine_searcher: SOURCES[2], cellartracker: "https://evil.example/ct" },
    ...over,
  },
});

const realDeps = { ...reviewDeps };
afterEach(() => Object.assign(reviewDeps, realDeps));

function fakeAi(make: () => LookupAnswer | Promise<LookupAnswer>) {
  let calls = 0;
  reviewDeps.enabled = () => true;
  reviewDeps.ask = async () => {
    calls++;
    return make();
  };
  return () => calls;
}

async function wine(email = "owner@example.com") {
  const c = await signIn(email);
  const op = vintageOp({ producer: "Opus One", wine: "Opus One", year: 2019 });
  await c.ops([op]);
  return { c, id: op.id };
}

describe("pro reviews: checking what the AI says", () => {
  it("keeps only scores whose page was searched and whose quote has the number", () => {
    const r = verify(answer(), searchLinks("Opus One", "Opus One", 2019));
    expect(r.critics).toEqual([
      {
        publication: "Wine Advocate",
        reviewer: "William Kelley",
        score: "97-99",
        url: "https://wine.com/product/opus-one-2019/123/",
        via: "wine.com",
      },
    ]);
    expect(r.community).toEqual({ avg: 93.1, count: 59, url: SOURCES[1] });
    expect(r.price).toEqual({ usd: 461, url: SOURCES[2] });
    expect(r.aromas).toEqual(["blackcurrant", "cedar"]);
    expect(r.links.wineSearcher).toBe(SOURCES[2]);
    expect(r.links.cellarTracker).toContain("cellartracker.com/list.asp");
  });

  it("drops a community average that is not CellarTracker's", () => {
    const r = verify(
      answer({ community: { avg: 95, count: 3, source_url: SOURCES[0] } }),
      searchLinks("Opus One", "Opus One", 2019),
    );
    expect(r.community).toBeNull();
  });

  it("reads scores as printed", () => {
    expect(cleanScore("98+")).toBe("98+");
    expect(cleanScore("97 – 99 pts")).toBe("97-99");
    expect(cleanScore("17.5/20")).toBe("17.5/20");
    expect(cleanScore("about 95")).toBeNull();
  });
});

describe("pro reviews: the shared lookup", () => {
  it("looks a vintage up once and keeps it for everyone", async () => {
    const calls = fakeAi(() => answer());
    const { c, id } = await wine();
    const first = await c.call(`/api/reviews/${id}`);
    expect(first.data).toMatchObject({ shared: null, mine: null, left: 30, available: true });

    const r = await c.call(`/api/reviews/${id}/lookup`, {});
    expect(r.status).toBe(200);
    expect(r.data.shared.status).toBe("done");
    expect(r.data.shared.review.critics).toHaveLength(1);
    expect(r.data.left).toBe(29);

    // Someone else gets the same result without a new lookup.
    const friend = await signIn("friend@example.com");
    const seen = await friend.call(`/api/reviews/${id}/lookup`, {});
    expect(seen.data.shared.review.price.usd).toBe(461);
    expect(seen.data.shared.canRefresh).toBe(false);
    expect(seen.data.left).toBe(DAILY_REVIEW_LIMIT);
    expect(calls()).toBe(1);
  });

  it("says when a lookup failed, and lets the next try wait", async () => {
    fakeAi(() => {
      throw new Error("timeout");
    });
    const { id } = await wine();
    const friend = await signIn("friend@example.com");
    const r = await friend.call(`/api/reviews/${id}/lookup`, {});
    expect(r.data.shared).toMatchObject({ status: "failed", canRetry: false });
    const job = await env.DB.prepare("SELECT status, error FROM ai_jobs WHERE kind = 'review'").first();
    expect(job).toMatchObject({ status: "failed", error: "timeout" });
  });

  it("stops at the daily limit", async () => {
    fakeAi(() => answer());
    const friend = await signIn("friend@example.com");
    for (let i = 0; i < DAILY_REVIEW_LIMIT; i++) {
      const op = vintageOp({ producer: "Ridge", wine: `Cuvée ${i}`, year: 2019 });
      await friend.ops([op]);
      expect((await friend.call(`/api/reviews/${op.id}/lookup`, {})).status).toBe(200);
    }
    const op = vintageOp({ producer: "Ridge", wine: "One too many", year: 2019 });
    await friend.ops([op]);
    const r = await friend.call(`/api/reviews/${op.id}/lookup`, {});
    expect([r.status, r.data.error]).toEqual([429, "review_limit"]);
  });

  it("stops when the month's budget is spent", async () => {
    fakeAi(() => answer());
    await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('review_monthly_limit', '0')").run();
    const { c, id } = await wine();
    expect((await c.call(`/api/reviews/${id}`)).data.available).toBe(false);
    const r = await c.call(`/api/reviews/${id}/lookup`, {});
    expect([r.status, r.data.error]).toEqual([503, "review_budget"]);
  });

  it("is off without an AI key", async () => {
    const { c, id } = await wine();
    expect((await c.call(`/api/reviews/${id}`)).data.available).toBe(false);
    expect((await c.call(`/api/reviews/${id}/lookup`, {})).status).toBe(503);
  });
});

describe("pro reviews: 用自己的 AI 查", () => {
  it("writes a prompt in each language with the fixed block at the end", () => {
    for (const lang of ["zh-CN", "zh-TW", "en"] as const) {
      const p = reviewPrompt(lang, "Opus One", "Opus One", 2019);
      expect(p).toContain("Opus One");
      expect(p).toContain("2019");
      expect(p.trim().endsWith("=== END ===")).toBe(true);
    }
    expect(reviewPrompt("zh-TW", "A", "B", 2019)).toContain("請上網搜尋");
  });

  it("reads the pasted answer even with chat formatting around it", () => {
    const pasted = `Here is what I found…

\`\`\`
=== WINE-JOURNAL ===
{"critics":[{"publication":"Vinous","reviewer":"Antonio Galloni","score":"97","url":"https://vinous.com/x"},{"publication":"","score":"99"}],
 "community":{"avg":"93.1","count":59,"url":null},
 "price_usd":null, "drink_window":"2027-2050",
 "aromas":["Cassis","cedar wood","pencil shavings"], "summary":“Polished.”}
=== END ===
\`\`\``;
    const r = parseImport(pasted, "en", searchLinks("Opus One", "Opus One", 2019))!;
    expect(r.critics).toEqual([
      { publication: "Vinous", reviewer: "Antonio Galloni", score: "97", url: "https://vinous.com/x", via: null },
    ]);
    expect(r.community?.avg).toBe(93.1);
    expect(r.community?.url).toContain("cellartracker.com");
    expect(r.summary?.en).toBe("Polished.");
    expect(parseImport("no block here", "en", searchLinks("a", "b", 2019))).toBeNull();
  });

  it("maps reviewers' words to the aroma vocabulary", () => {
    expect(aromaIds(["Blackcurrant", "cedar", "violets"])).toEqual(["blackcurrant", "cedar", "violet"]);
  });

  it("keeps an import private to the person, apart from the shared lookup", async () => {
    const { c, id } = await wine();
    const text = `=== WINE-JOURNAL ===\n{"critics":[{"publication":"Decanter","reviewer":null,"score":"96","url":"https://decanter.com/x"}],"community":null,"price_usd":null,"drink_window":null,"aromas":[],"summary":"好酒。"}\n=== END ===`;
    const r = await c.call(`/api/reviews/${id}/import`, { text, lang: "zh-CN" });
    expect(r.status).toBe(200);
    expect(r.data.mine.review.critics[0].score).toBe("96");
    expect(r.data.shared).toBeNull();

    const friend = await signIn("friend@example.com");
    expect((await friend.call(`/api/reviews/${id}`)).data.mine).toBeNull();

    const bad = await c.call(`/api/reviews/${id}/import`, { text: "nothing useful" });
    expect([bad.status, bad.data.error]).toEqual([400, "bad_import"]);
    const gone = await c.call(`/api/reviews/${id}/import`, undefined, "DELETE");
    expect(gone.data.mine).toBeNull();
  });

  it("takes error reports", async () => {
    const { c, id } = await wine();
    expect((await c.call(`/api/reviews/${id}/report`, { note: "WA is 98" })).status).toBe(200);
    const row = await env.DB.prepare("SELECT note FROM pro_review_reports").first();
    expect(row).toEqual({ note: "WA is 98" });
  });
});
