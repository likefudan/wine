import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { CellarLot } from "../src/shared/cellar";
import { type Tasting, type VintageInfo, ulid } from "../src/shared/model";
import { STRETCHES, pickStretch } from "../src/shared/stretch";
import {
  type Candidate,
  criticAverage,
  guess,
  nextPicks,
  recsQuery,
  stretchWines,
  tasteProfile,
  tonightPicks,
} from "../src/shared/taste";
import { signIn, tasting, vintageOp } from "./helpers";

let n = 0;
const vin = (over: Partial<VintageInfo> = {}): VintageInfo => {
  n++;
  return {
    id: `v${n}`,
    wineId: `w${n}`,
    producer: `Producer ${n}`,
    wine: `Wine ${n}`,
    year: 2018,
    color: "red",
    country: "USA",
    region: "California",
    area: "Napa Valley",
    appellation: null,
    grapes: ["Cabernet Sauvignon"],
    abv: null,
    ...over,
  };
};
const note = (v: VintageInfo, score: number | null, over: Partial<Tasting> = {}): Tasting =>
  tasting(v.id, { score, palate: {}, descriptors: [], ...over });
const lot = (vintageId: string, over: Partial<CellarLot> = {}): CellarLot => ({
  id: ulid(),
  vintageId,
  qty: 2,
  sizeMl: 750,
  location: null,
  boughtOn: null,
  price: null,
  currency: null,
  source: null,
  drinkFrom: null,
  drinkTo: null,
  note: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("口味画像", () => {
  it("finds what I score above my own average, shrunk towards it", () => {
    const cabs = [vin(), vin(), vin()];
    const pinots = [
      vin({ grapes: ["Pinot Noir"], region: "Burgundy", area: "Côte de Nuits", country: "France" }),
      vin({ grapes: ["Pinot Noir"], region: "Burgundy", area: "Côte de Nuits", country: "France" }),
    ];
    const one = vin({ grapes: ["Syrah"], region: "Rhone", area: null, country: "France" });
    const vs = [...cabs, ...pinots, one];
    const ts = [
      ...cabs.map((v) => note(v, 94, { palate: { tannin: 5 } })),
      ...pinots.map((v) => note(v, 84, { palate: { tannin: 2 } })),
      note(one, 99),
    ];
    const p = tasteProfile(ts, vs);
    expect(p.scored).toBe(6);
    expect(p.confidence).toBe("early");
    expect(p.baseline).toBeCloseTo((94 * 3 + 84 * 2 + 99) / 6, 1);
    const cab = p.features.find((f) => f.kind === "grape" && f.key === "Cabernet Sauvignon")!;
    expect(cab).toMatchObject({ n: 3, avg: 94 });
    // 3 wines × (94 − 91.5) / (3 + 2)
    expect(cab.delta).toBeCloseTo(1.5, 1);
    expect(p.likes.map((f) => f.key)).toContain("Napa Valley");
    // California and USA hold the same three wines as Napa Valley: not listed again.
    expect(p.likes.map((f) => f.key)).not.toContain("California");
    expect(p.dislikes.map((f) => f.key)).toContain("Pinot Noir");
    // One great Syrah is not a preference.
    expect(p.features.some((f) => f.key === "Syrah")).toBe(false);
    expect(p.structure).toEqual([expect.objectContaining({ dim: "tannin", band: "high" })]);
    expect(p.triedGrapes.has("Syrah")).toBe(true);
  });

  it("counts a wine tasted twice once, at its average, and ignores unscored notes", () => {
    const a = vin();
    const b = vin({ id: "other-vintage", wineId: a.wineId, year: 2019 });
    const p = tasteProfile([note(a, 90), note(b, 96), note(vin(), null)], [a, b]);
    expect(p.scored).toBe(1);
    expect(p.myWines.get(a.wineId)).toEqual({ avg: 93, n: 2 });
    expect(p.confidence).toBe("none");
  });

  it("measures my gap to the critics", () => {
    const vs = [vin(), vin(), vin({ grapes: ["Chardonnay"], color: "white" })];
    const ts = [note(vs[0]!, 90), note(vs[1]!, 88), note(vs[2]!, 95)];
    const pro = [
      { vintageId: vs[0]!.id, critic: 96, community: null },
      { vintageId: vs[1]!.id, critic: 94, community: null },
      { vintageId: vs[2]!.id, critic: 93, community: 92 },
    ];
    const p = tasteProfile(ts, vs, pro);
    const all = p.gaps.find((g) => g.kind === "all")!;
    expect(all.n).toBe(3);
    // (−6 − 6 + 2) / (3 + 1)
    expect(all.gap).toBeCloseTo(-2.5, 1);
    expect(p.gaps.find((g) => g.kind === "grape" && g.key === "Cabernet Sauvignon")?.gap).toBeCloseTo(-4, 1);
  });

  it("reads critics' scores as one number", () => {
    expect(criticAverage([{ score: "97" }, { score: "97-99" }, { score: "17.5/20" }, { score: "98+" }])).toBe(97.7);
    expect(criticAverage([{ score: "17/20" }])).toBeNull();
    expect(criticAverage([])).toBeNull();
  });
});

describe("今晚开哪瓶", () => {
  const year = 2026;
  it("opens what is past or ending first, then what I like", () => {
    const vs = [vin(), vin(), vin(), vin({ color: "white", grapes: ["Chardonnay"] })];
    const lots = [
      lot(vs[0]!.id, { drinkFrom: 2030, drinkTo: 2040 }), // wait
      lot(vs[1]!.id, { drinkFrom: 2015, drinkTo: 2025 }), // past
      lot(vs[2]!.id, { drinkFrom: 2020, drinkTo: 2026 }), // last
      lot(vs[3]!.id, { drinkFrom: 2024, drinkTo: 2030 }), // ready
      lot(vs[0]!.id, { qty: 0 }),
    ];
    const p = tasteProfile([], vs);
    const picks = tonightPicks(lots, vs, [], [], p, "any", year);
    expect(picks.map((x) => x.status)).toEqual(["past", "last", "ready"]);
    expect(picks[0]!.reasons[0]).toEqual({ k: "past" });
    // Light: the white comes first.
    expect(tonightPicks(lots, vs, [], [], p, "light", year)[0]!.v.color).toBe("white");
  });

  it("weighs price for a weeknight or a celebration", () => {
    const vs = [vin(), vin(), vin()];
    const lots = [
      lot(vs[0]!.id, { price: 100, currency: "USD", drinkFrom: 2020, drinkTo: 2035 }),
      lot(vs[1]!.id, { price: 400, currency: "USD", drinkFrom: 2020, drinkTo: 2035 }),
      lot(vs[2]!.id, { price: 120, currency: "USD", drinkFrom: 2020, drinkTo: 2035 }),
    ];
    const p = tasteProfile([], vs);
    expect(tonightPicks(lots, vs, [], [], p, "special", year)[0]!.v.id).toBe(vs[1]!.id);
    expect(tonightPicks(lots, vs, [], [], p, "weeknight", year)[2]!.v.id).toBe(vs[1]!.id);
  });

  it("says when I loved this wine before", () => {
    const a = vin();
    const b = vin({ id: "b-2020", wineId: a.wineId, year: 2020 });
    const filler = [vin(), vin(), vin()];
    const ts = [note(a, 97), ...filler.map((v) => note(v, 88))];
    const p = tasteProfile(ts, [a, b, ...filler]);
    const picks = tonightPicks([lot(b.id), lot(filler[0]!.id)], [a, b, ...filler], ts, [], p, "any", year);
    expect(picks[0]!.v.id).toBe(b.id);
    expect(picks[0]!.reasons).toContainEqual({ k: "mine", score: 97 });
  });
});

describe("下一款试试", () => {
  const cand = (over: Partial<Candidate>): Candidate => ({
    key: ulid(),
    source: "catalog",
    wineId: null,
    lwin: null,
    producer: "X",
    wine: "Y",
    color: "red",
    country: "USA",
    region: "California",
    area: null,
    appellation: null,
    grapes: [],
    year: null,
    critic: null,
    community: null,
    stretch: false,
    ...over,
  });

  it("ranks by what I like, one per producer", () => {
    const cabs = [vin(), vin(), vin()];
    const others = [
      vin({ grapes: ["Merlot"], area: "Sonoma County" }),
      vin({ grapes: ["Merlot"], area: "Sonoma County" }),
    ];
    const ts = [...cabs.map((v) => note(v, 95)), ...others.map((v) => note(v, 85))];
    const p = tasteProfile(ts, [...cabs, ...others]);
    const list = [
      cand({ producer: "A", grapes: ["Merlot"], area: "Sonoma County" }),
      cand({ producer: "B", grapes: ["Cabernet Sauvignon"], area: "Napa Valley", critic: 95 }),
      cand({ producer: "B", wine: "Second", grapes: ["Cabernet Sauvignon"], area: "Napa Valley" }),
      cand({ producer: "C", grapes: ["Cabernet Sauvignon"] }),
      cand({ producer: "D", grapes: ["Gamay"], stretch: true }),
    ];
    const picks = nextPicks(p, list);
    expect(picks.map((x) => x.c.producer)).toEqual(["B", "C"]);
    expect(picks[0]!.why.map((f) => f.key)).toContain("Cabernet Sauvignon");
    expect(stretchWines(list).map((c) => c.producer)).toEqual(["D"]);
    expect(guess(p, list[1]!).lift).toBeGreaterThan(guess(p, list[3]!).lift);
    const q = recsQuery(p, STRETCHES[0]!, 1);
    expect(q.grapes).toEqual(["Cabernet Sauvignon"]);
    expect(q.areas).toEqual(["Napa Valley"]);
    expect(q.stretch?.grape).toBe("Cabernet Franc");
  });

  it("steps from a liked grape to one I have not tried", () => {
    expect(pickStretch(["Pinot Noir"], new Set(["Pinot Noir"]))?.grape).toBe("Gamay");
    expect(pickStretch(["Pinot Noir"], new Set(["Pinot Noir", "Gamay"]))?.grape).toBe("Nebbiolo");
    expect(pickStretch([], new Set())?.grape).toBe("Pinot Noir");
    expect(pickStretch(["Pinot Noir"], new Set(["Pinot Noir"]), 1)?.grape).toBe("Nebbiolo");
  });
});

describe("GET /api/recs", () => {
  afterEach(async () => {
    await env.DB.prepare("DELETE FROM lwin WHERE lwin < 100").run();
  });

  it("finds wines I have not had in the catalogue and LWIN, with the critics' score", async () => {
    const a = await signIn("a@example.com");
    const b = await signIn("b@example.com");
    const mine = vintageOp();
    const theirs = vintageOp({ producer: "Shafer", wine: "Hillside Select", region: "Napa Valley", year: 2018 });
    const unrelated = vintageOp({
      producer: "Dr. Loosen",
      wine: "Blue Slate",
      grapes: ["Riesling"],
      color: "white",
      region: "Mosel",
      country: "Germany",
    });
    await a.ops([mine, { op: "putTasting", tasting: tasting(mine.id) }]);
    const r = await b.ops([theirs, unrelated, { op: "putTasting", tasting: tasting(theirs.id) }]);
    const theirId = r.data.results[0]!.vintageId!;
    await env.DB.prepare(
      "INSERT INTO pro_reviews (vintage_id, status, data, started_at, fetched_at) VALUES (?, 'done', ?, ?, ?)",
    )
      .bind(
        theirId,
        JSON.stringify({ critics: [{ score: "98" }, { score: "96" }], community: { avg: 94 } }),
        "2026-11-01",
        "2026-11-01",
      )
      .run();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO lwin VALUES (11, 'Charles Joguet', 'Clos du Chene Vert', 'red', 'France', 'Loire', 'Chinon', NULL)",
      ),
      env.DB.prepare(
        "INSERT INTO lwin VALUES (12, 'Spottswoode', 'Cabernet', 'red', 'USA', 'California', 'Napa Valley', NULL)",
      ),
      env.DB.prepare("INSERT INTO lwin VALUES (13, 'No Colour', 'X', NULL, 'USA', 'California', 'Napa Valley', NULL)"),
    ]);
    const res = await a.call<{ candidates: Candidate[] }>("/api/recs", {
      grapes: ["Cabernet Sauvignon"],
      regions: [],
      areas: ["Napa Valley"],
      producers: [],
      stretch: { grape: "Cabernet Franc", places: ["Chinon"], color: "red" },
      seed: 1,
    });
    expect(res.status).toBe(200);
    const byName = new Map(res.data.candidates.map((c) => [c.producer, c]));
    // Mine is left out; theirs comes with what the critics' lookup found; Riesling doesn't match.
    expect(byName.has("Ridge Vineyards")).toBe(false);
    expect(byName.has("Dr. Loosen")).toBe(false);
    expect(byName.get("Shafer")).toMatchObject({
      source: "catalog",
      critic: 97,
      community: 94,
      year: 2018,
      stretch: false,
    });
    expect(byName.get("Spottswoode")).toMatchObject({ source: "lwin", lwin: 12, area: "Napa Valley", stretch: false });
    expect(byName.get("Charles Joguet")).toMatchObject({ stretch: true, grapes: ["Cabernet Franc"], region: "Loire" });
    expect(byName.has("No Colour")).toBe(false);
  });

  it("needs a login", async () => {
    const { Client } = await import("./helpers");
    expect((await new Client().call("/api/recs", { grapes: [] })).status).toBe(401);
  });

  it("brings the critics' scores on my wines down with sync", async () => {
    const c = await signIn();
    const v = vintageOp();
    await c.ops([v, { op: "putTasting", tasting: tasting(v.id) }]);
    const id = (await c.call("/api/sync")).data.tastings[0].vintageId;
    await env.DB.prepare(
      "INSERT INTO pro_reviews (vintage_id, status, data, started_at, fetched_at) VALUES (?, 'done', ?, ?, ?)",
    )
      .bind(id, JSON.stringify({ critics: [{ score: "95" }], community: null }), "2026-11-01", "2026-11-01")
      .run();
    expect((await c.call("/api/sync")).data.proScores).toEqual([{ vintageId: id, critic: 95, community: null }]);
  });
});
