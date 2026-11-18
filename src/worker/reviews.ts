import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { BLIND } from "../shared/blind";
import { DESCRIPTORS } from "../shared/descriptors";
import { ID_RE, isLang, ulid } from "../shared/model";
import {
  type CriticScore,
  MAX_CRITICS,
  type ProReview,
  type ReviewsView,
  cleanScore,
  cleanUrl,
  domainOf,
  parseImport,
  scoreNumbers,
  searchLinks,
  viaOf,
} from "../shared/reviews";
import { type UserRow, isOwner, requireApproved, requireSameOrigin, requireUser } from "./auth";
import { VINTAGE_SELECT, type VintageRow } from "./data";
import { claudeUsage, logCall, requireBudget } from "./costs";
import type { Env } from "./env";
import { HttpError, now, readJson } from "./http";
import { azureHost, aiEnabled } from "./label";

/**
 * 专业评价 (docs/design.zh.md §3.2). The first person to ask about a vintage starts one lookup by
 * Claude Sonnet with web search (Wine-Searcher and CellarTracker block programs, so we never request
 * them ourselves: docs/review-spike.zh.md); the result is kept for everyone. Scores are kept as
 * printed, one per reviewer, each with its source; the server drops any score whose source was not
 * in this lookup's search results or whose quote does not contain the number.
 *
 * The lookup runs inside the request (about 16 s, at most ~40 s) and is also handed to waitUntil,
 * so it finishes and is saved even if the phone leaves the page. A second person asking meanwhile
 * sees "正在查找" and polls.
 */

export const REVIEW_MODEL = "claude-sonnet-5-5";
/** New lookups per person per day (cached ones are free). About $0.21 each. */
export const DAILY_REVIEW_LIMIT = 5;
export const OWNER_DAILY_REVIEW_LIMIT = 30;
/** New lookups for the whole site per calendar month (UTC), unless settings.review_monthly_limit says otherwise. */
export const MONTHLY_REVIEW_LIMIT = 300;
/** A lookup that has said nothing for this long is taken as lost, and may be started again. */
const STALE_MS = 3 * 60_000;
/** After a failed lookup, others wait this long before trying the same wine again. */
const RETRY_MS = 10 * 60_000;
/** Prices move: anyone may refresh a lookup this old. */
export const REFRESH_DAYS = 90;
const MAX_PASTE = 60_000;

const SCORE_ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["publication", "reviewer", "score", "source_url", "evidence"],
  properties: {
    publication: { type: "string" },
    reviewer: { type: ["string", "null"] },
    score: { type: "string" },
    source_url: { type: "string" },
    evidence: { type: "string" },
  },
};
const SOURCED_NUMBER = (field: string, extra: Record<string, unknown> = {}) => ({
  anyOf: [
    { type: "null" },
    {
      type: "object",
      additionalProperties: false,
      required: [field, ...Object.keys(extra), "source_url"],
      properties: { [field]: { type: "number" }, ...extra, source_url: { type: "string" } },
    },
  ],
});
export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["critic_scores", "community", "price_usd", "drink_window", "aromas", "summary", "pages"],
  properties: {
    critic_scores: { type: "array", items: SCORE_ITEM },
    community: SOURCED_NUMBER("avg", { count: { type: ["integer", "null"] } }),
    price_usd: SOURCED_NUMBER("avg"),
    drink_window: { type: ["string", "null"] },
    aromas: {
      type: "array",
      items: { type: "string", enum: DESCRIPTORS.filter((d) => d.wset.length).map((d) => d.id) },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["zh", "tw", "en"],
      properties: { zh: { type: "string" }, tw: { type: "string" }, en: { type: "string" } },
    },
    pages: {
      type: "object",
      additionalProperties: false,
      required: ["wine_searcher", "cellartracker"],
      properties: { wine_searcher: { type: ["string", "null"] }, cellartracker: { type: ["string", "null"] } },
    },
  },
};

const AROMA_LIST = DESCRIPTORS.map((d) => `${d.id} (${d.name.en})`).join(", ");

export function lookupPrompt(v: { producer: string; wine: string; year: number }): string {
  const name = v.wine.toLowerCase().includes(v.producer.toLowerCase()) ? v.wine : `${v.producer} ${v.wine}`;
  return `You are checking published reviews for one wine.
Wine: ${name}, vintage ${v.year > 0 ? v.year : "NV (non-vintage)"}.
Use web search (at most 5 searches). Good queries: the wine name and vintage with "wine-searcher", with "cellartracker", and with critic names. Retailer pages (wine.com, K&L, Total Wine, the winery's accolades page) often quote critic scores.
Rules:
- critic_scores: only a score a search result shows for this exact wine AND this exact vintage. Never estimate, never average. Copy the score exactly as printed ("97-99", "98+", "17.5/20"). One entry per reviewer: a publication (Wine Advocate, Vinous…) can have several reviewers; give the reviewer's name when shown, else null. source_url is the page where you saw it; evidence is a quote of at most 15 words from that page that contains the score.
- community: CellarTracker's community average and number of notes, with the CellarTracker URL; null if not found.
- price_usd: Wine-Searcher's average price in US dollars, with the Wine-Searcher URL; null if not found.
- drink_window: e.g. "2027-2045" if a critic gives one, else null.
- aromas: up to 8 ids from this list for aromas the reviews mention: ${AROMA_LIST}.
- summary: 2-3 sentences in your own words (never copy review text) on style and how critics see it: zh in Simplified Chinese, tw in Traditional Chinese with Taiwan wine wording, en in English. If nothing was found, say so briefly.
- pages: the wine's own page on wine-searcher.com and on cellartracker.com if a result shows one, else null.`;
}

/** What one lookup returned: the model's JSON, and every URL its searches returned. */
export interface LookupAnswer {
  json: unknown;
  urls: string[];
  usage: { input: number; output: number; searches: number };
}

async function askWithSearch(env: Env, prompt: string, userId: string | null = null): Promise<LookupAnswer> {
  const client = new Anthropic({
    apiKey: env.AZURE_FOUNDRY_API_KEY!,
    baseURL: `${azureHost(env)}/anthropic`,
    timeout: 90_000,
    maxRetries: 0,
  });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const blocks: Anthropic.ContentBlock[] = [];
  const usage = { input: 0, output: 0, searches: 0 };
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages.create({
      model: REVIEW_MODEL,
      max_tokens: 6000,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming);
    usage.input += res.usage.input_tokens;
    usage.output += res.usage.output_tokens;
    usage.searches += res.usage.server_tool_use?.web_search_requests ?? 0;
    // 模型开销: each request is billed on its own, searches included, whatever becomes of the answer.
    await logCall(env, { userId, feature: "review", model: REVIEW_MODEL, usage: claudeUsage(res.usage) });
    blocks.push(...res.content);
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.ContentBlockParam[] });
  }
  const urls = blocks.flatMap((b) =>
    b.type === "web_search_tool_result" && Array.isArray(b.content) ? b.content.map((r) => r.url) : [],
  );
  const text = blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { json: JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)), urls, usage };
}

/** Swappable in tests: nothing here calls the real AI there. */
export const reviewDeps = {
  enabled: (env: Env) => aiEnabled(env),
  ask: askWithSearch,
};

/** host + path, to compare a quoted URL with the search results whatever http/www/slash it has. */
const urlKey = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return "";
  }
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const isSite = (url: string, site: string) => {
  const d = domainOf(url);
  return d === site || d.endsWith(`.${site}`);
};

/**
 * The model's answer, kept only where it can be checked (§3.2 hard rule 1): every score's page must
 * be one of this lookup's search results, and its quote must contain the number.
 */
export function verify(answer: LookupAnswer, links: ProReview["links"]): ProReview {
  const seen = new Set(answer.urls.map(urlKey).filter(Boolean));
  const found = (url: string | null): url is string => !!url && seen.has(urlKey(url));
  const j = (answer.json ?? {}) as Record<string, unknown>;

  const critics: CriticScore[] = [];
  const dup = new Set<string>();
  for (const c of Array.isArray(j.critic_scores) ? j.critic_scores : []) {
    const o = (c ?? {}) as Record<string, unknown>;
    const publication = str(o.publication, 60);
    const score = cleanScore(o.score);
    const url = cleanUrl(o.source_url);
    const evidence = typeof o.evidence === "string" ? o.evidence : "";
    if (!publication || !score || !found(url)) continue;
    if (!scoreNumbers(score).every((n) => evidence.includes(n))) continue;
    const reviewer = str(o.reviewer, 60);
    const key = `${publication}|${reviewer ?? ""}|${score}`.toLowerCase();
    if (dup.has(key)) continue;
    dup.add(key);
    critics.push({ publication, reviewer, score, url, via: viaOf(url) });
    if (critics.length >= MAX_CRITICS) break;
  }

  const comm = (j.community ?? null) as Record<string, unknown> | null;
  const commUrl = comm ? cleanUrl(comm.source_url) : null;
  const avg = comm && typeof comm.avg === "number" && comm.avg >= 50 && comm.avg <= 100 ? comm.avg : null;
  const community =
    comm && avg !== null && found(commUrl) && isSite(commUrl, "cellartracker.com")
      ? {
          avg: Math.round(avg * 10) / 10,
          count: Number.isInteger(comm.count) && (comm.count as number) >= 0 ? (comm.count as number) : null,
          url: commUrl,
        }
      : null;

  const pr = (j.price_usd ?? null) as Record<string, unknown> | null;
  const priceUrl = pr ? cleanUrl(pr.source_url) : null;
  const price =
    pr && typeof pr.avg === "number" && pr.avg > 0 && pr.avg < 1_000_000 && found(priceUrl)
      ? isSite(priceUrl, "wine-searcher.com")
        ? { usd: Math.round(pr.avg), url: priceUrl }
        : null
      : null;

  const pages = (j.pages ?? {}) as Record<string, unknown>;
  const ws = cleanUrl(pages.wine_searcher);
  const ct = cleanUrl(pages.cellartracker);
  const s = (j.summary ?? {}) as Record<string, unknown>;
  const zh = str(s.zh, 400);
  const tw = str(s.tw, 400);
  const en = str(s.en, 600);
  return {
    critics,
    community,
    price,
    drinkWindow: str(j.drink_window, 40),
    aromas: (Array.isArray(j.aromas) ? j.aromas : [])
      .filter((a): a is string => typeof a === "string" && DESCRIPTORS.some((d) => d.id === a))
      .filter((a, i, all) => all.indexOf(a) === i)
      .slice(0, 8),
    summary: zh || tw || en ? { zh: zh ?? "", tw: tw ?? "", en: en ?? "" } : null,
    links: {
      wineSearcher: ws && isSite(ws, "wine-searcher.com") ? ws : links.wineSearcher,
      cellarTracker: ct && isSite(ct, "cellartracker.com") ? ct : links.cellarTracker,
    },
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────────────────────

type DB = D1Database;

interface ReviewRow {
  status: "pending" | "done" | "failed";
  data: string | null;
  started_at: string;
  fetched_at: string | null;
}

async function loadVintage(db: DB, rawId: string): Promise<VintageRow> {
  if (!ID_RE.test(rawId) || rawId === BLIND) throw new HttpError(404, "not_found", "找不到这款酒");
  const row = await db
    .prepare(
      `${VINTAGE_SELECT} WHERE v.id = COALESCE((SELECT vintage_id FROM vintage_aliases WHERE alias_id = ?1), ?1)`,
    )
    .bind(rawId)
    .first<VintageRow>();
  if (!row) throw new HttpError(404, "not_found", "找不到这款酒");
  return row;
}

const dailyLimit = (env: Env, u: UserRow) => (isOwner(env, u.email) ? OWNER_DAILY_REVIEW_LIMIT : DAILY_REVIEW_LIMIT);

async function usedToday(db: DB, userId: string): Promise<number> {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM ai_jobs WHERE user_id = ? AND kind = 'review' AND created_at > ?")
    .bind(userId, since)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function monthlyRoom(db: DB): Promise<boolean> {
  const d = new Date();
  const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const [used, setting] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM ai_jobs WHERE kind = 'review' AND created_at >= ?").bind(monthStart),
    db.prepare("SELECT value FROM settings WHERE key = 'review_monthly_limit'"),
  ]);
  const limit = Number((setting!.results[0] as { value?: string } | undefined)?.value);
  const cap = Number.isInteger(limit) && limit >= 0 ? limit : MONTHLY_REVIEW_LIMIT;
  return ((used!.results[0] as { n: number }).n ?? 0) < cap;
}

const age = (iso: string | null) => (iso ? Date.now() - Date.parse(iso) : Number.POSITIVE_INFINITY);

async function view(env: Env, user: UserRow, vintageId: string): Promise<ReviewsView> {
  const db = env.DB;
  const [shared, mine] = await db.batch([
    db.prepare("SELECT status, data, started_at, fetched_at FROM pro_reviews WHERE vintage_id = ?").bind(vintageId),
    db
      .prepare("SELECT data, created_at FROM pro_review_imports WHERE user_id = ? AND vintage_id = ?")
      .bind(user.id, vintageId),
  ]);
  const s = shared!.results[0] as ReviewRow | undefined;
  const m = mine!.results[0] as { data: string; created_at: string } | undefined;
  const owner = isOwner(env, user.email);
  let out: ReviewsView["shared"] = null;
  if (s?.status === "pending" && age(s.started_at) < STALE_MS) out = { status: "pending", startedAt: s.started_at };
  else if (s?.data && s.fetched_at)
    out = {
      status: "done",
      review: JSON.parse(s.data) as ProReview,
      fetchedAt: s.fetched_at,
      canRefresh: owner || age(s.fetched_at) > REFRESH_DAYS * 86400_000,
    };
  else if (s) out = { status: "failed", at: s.started_at, canRetry: owner || age(s.started_at) > RETRY_MS };
  const left = Math.max(0, dailyLimit(env, user) - (await usedToday(db, user.id)));
  return {
    shared: out,
    mine: m ? { review: JSON.parse(m.data) as ProReview, importedAt: m.created_at } : null,
    left,
    available: reviewDeps.enabled(env) && (await monthlyRoom(db)),
  };
}

/** One lookup, start to finish: always leaves the row done, or failed (or back to its old result). */
async function runLookup(env: Env, user: UserRow, v: VintageRow, jobId: string): Promise<void> {
  const db = env.DB;
  const links = searchLinks(v.producer, v.wine, v.year);
  try {
    const answer = await reviewDeps.ask(env, lookupPrompt(v), user.id);
    const review = verify(answer, links);
    const at = now();
    await db.batch([
      db
        .prepare(
          "UPDATE pro_reviews SET status = 'done', data = ?, model = ?, fetched_at = ?, error = NULL WHERE vintage_id = ?",
        )
        .bind(JSON.stringify(review), REVIEW_MODEL, at, v.id),
      db
        .prepare("UPDATE ai_jobs SET status = 'done', model = ?, input_tokens = ?, output_tokens = ? WHERE id = ?")
        .bind(REVIEW_MODEL, answer.usage.input, answer.usage.output, jobId),
    ]);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 300);
    console.error("review lookup failed:", v.id, msg);
    await db.batch([
      // A refresh that fails keeps the old result.
      db
        .prepare(
          "UPDATE pro_reviews SET status = CASE WHEN data IS NULL THEN 'failed' ELSE 'done' END, error = ? WHERE vintage_id = ?",
        )
        .bind(msg, v.id),
      db.prepare("UPDATE ai_jobs SET status = 'failed', error = ? WHERE id = ?").bind(msg, jobId),
    ]);
  }
}

export const reviewRoutes = new Hono<{ Bindings: Env }>();

reviewRoutes.get("/reviews/:id", async (c) => {
  const user = await requireUser(c);
  const v = await loadVintage(c.env.DB, c.req.param("id"));
  return c.json(await view(c.env, user, v.id));
});

/** 查专业评价: answers once the lookup is done (or at once, when someone else's is running). */
reviewRoutes.post("/reviews/:id/lookup", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  requireApproved(c.env, user);
  const db = c.env.DB;
  const v = await loadVintage(db, c.req.param("id"));
  const before = await view(c.env, user, v.id);
  const s = before.shared;
  if (s?.status === "pending") return c.json(before);
  if (s?.status === "done" && !s.canRefresh) return c.json(before);
  if (s?.status === "failed" && !s.canRetry) return c.json(before);
  if (!reviewDeps.enabled(c.env)) throw new HttpError(503, "ai_off", "专业评价查询还没有开通");
  if (!before.available)
    throw new HttpError(503, "review_budget", "本月的专业评价查询额度用完了，可以先用自己的 AI 查");
  if (before.left <= 0) throw new HttpError(429, "review_limit", "今天的专业评价查询次数用完了，可以先用自己的 AI 查");
  await requireBudget(c.env, user);

  // Claim the row: only one lookup per vintage at a time, even when two people tap together.
  const at = now();
  const stale = new Date(Date.now() - STALE_MS).toISOString();
  const claim = await db
    .prepare(
      `INSERT INTO pro_reviews (vintage_id, status, requested_by, started_at) VALUES (?1, 'pending', ?2, ?3)
       ON CONFLICT (vintage_id) DO UPDATE SET status = 'pending', requested_by = ?2, started_at = ?3
       WHERE pro_reviews.status != 'pending' OR pro_reviews.started_at < ?4`,
    )
    .bind(v.id, user.id, at, stale)
    .run();
  if (!claim.meta.changes) return c.json(await view(c.env, user, v.id));
  const jobId = ulid();
  await db
    .prepare(
      "INSERT INTO ai_jobs (id, user_id, kind, status, model, created_at) VALUES (?, ?, 'review', 'running', ?, ?)",
    )
    .bind(jobId, user.id, REVIEW_MODEL, at)
    .run();
  const job = runLookup(c.env, user, v, jobId);
  try {
    c.executionCtx.waitUntil(job);
  } catch {
    // No execution context (a plain call in tests): awaiting below is enough.
  }
  await job;
  return c.json(await view(c.env, user, v.id));
});

/** 用自己的 AI 查: keep what was pasted back, for this person only. */
reviewRoutes.post("/reviews/:id/import", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const db = c.env.DB;
  const v = await loadVintage(db, c.req.param("id"));
  const body = await readJson(c.req.raw);
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new HttpError(400, "bad_import", "请粘贴 AI 的回答");
  if (text.length > MAX_PASTE) throw new HttpError(400, "bad_import", "内容太长");
  const lang = isLang(body.lang) ? body.lang : "zh-CN";
  const review = parseImport(text, lang, searchLinks(v.producer, v.wine, v.year));
  if (!review)
    throw new HttpError(
      400,
      "bad_import",
      "没找到结果段落，请把 AI 回答的最后一段（含 === WINE-JOURNAL === 那几行）完整粘贴进来",
    );
  await db
    .prepare(
      `INSERT INTO pro_review_imports (user_id, vintage_id, data, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, vintage_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
    )
    .bind(user.id, v.id, JSON.stringify(review), now())
    .run();
  return c.json(await view(c.env, user, v.id));
});

reviewRoutes.delete("/reviews/:id/import", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const v = await loadVintage(c.env.DB, c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM pro_review_imports WHERE user_id = ? AND vintage_id = ?")
    .bind(user.id, v.id)
    .run();
  return c.json(await view(c.env, user, v.id));
});

/** 报告错误: noted for the owner, at most 10 a day per person. */
reviewRoutes.post("/reviews/:id/report", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const db = c.env.DB;
  const v = await loadVintage(db, c.req.param("id"));
  const since = new Date(Date.now() - 86400_000).toISOString();
  const n = await db
    .prepare("SELECT COUNT(*) AS n FROM pro_review_reports WHERE user_id = ? AND created_at > ?")
    .bind(user.id, since)
    .first<{ n: number }>();
  if ((n?.n ?? 0) >= 10) throw new HttpError(429, "report_limit", "今天报告得太多了，明天再试");
  const note = str((await readJson(c.req.raw)).note, 500);
  await db
    .prepare("INSERT INTO pro_review_reports (id, vintage_id, user_id, note, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(ulid(), v.id, user.id, note, now())
    .run();
  return c.json({ ok: true });
});
