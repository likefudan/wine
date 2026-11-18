import { Hono } from "hono";
import { type CostDay, type ModelPrice, type Usage, costOf } from "../shared/costs";
import { ulid } from "../shared/model";
import { isOwner, requireSameOrigin, requireUser } from "./auth";
import type { Env } from "./env";
import { HttpError, now, readJson } from "./http";

/**
 * 模型开销: every request to a paid model is written down here with what it used and what it cost
 * (src/shared/costs.ts), and owners read the sums on 我的 → 开销. Writing it down never breaks the
 * feature that made the request: a failure is logged and forgotten.
 */

type PriceRow = {
  model: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
  search_per_k: number;
  updated_at: string | null;
};

const toPrice = (r: PriceRow): ModelPrice => ({
  model: r.model,
  input: r.input_per_mtok,
  output: r.output_per_mtok,
  cacheRead: r.cache_read_per_mtok,
  cacheWrite: r.cache_write_per_mtok,
  searchPerK: r.search_per_k,
  updatedAt: r.updated_at,
});

/** Tokens from an Anthropic response's `usage`, web searches included. */
export const claudeUsage = (u: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}): Usage => ({
  input: u.input_tokens,
  output: u.output_tokens,
  cacheRead: u.cache_read_input_tokens ?? 0,
  cacheWrite: u.cache_creation_input_tokens ?? 0,
  searches: u.server_tool_use?.web_search_requests ?? 0,
});

/** Adds one usage to another (a lookup that took several requests, logged as one). */
export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: (a.cacheRead ?? 0) + (b.cacheRead ?? 0),
  cacheWrite: (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0),
  searches: (a.searches ?? 0) + (b.searches ?? 0),
});

/** Writes down one billed request; `ok: false` = it answered but the answer was not used. */
export async function logCall(
  env: Env,
  call: { userId: string | null; feature: string; model: string; usage: Usage; ok?: boolean },
): Promise<void> {
  try {
    const row = await env.DB.prepare("SELECT * FROM model_prices WHERE model = ?").bind(call.model).first<PriceRow>();
    const u = call.usage;
    await env.DB.prepare(
      `INSERT INTO ai_calls (id, user_id, feature, model, ok, input_tokens, output_tokens, cache_read_tokens,
         cache_write_tokens, web_searches, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        ulid(),
        call.userId,
        call.feature,
        call.model,
        call.ok === false ? 0 : 1,
        u.input,
        u.output,
        u.cacheRead ?? 0,
        u.cacheWrite ?? 0,
        u.searches ?? 0,
        costOf(row && toPrice(row), u),
        now(),
      )
      .run();
  } catch (e) {
    console.error("ai_calls", e);
  }
}

/** 全站每日花费上限 (USD, last 24 hours, every paid call) when no owner has set one. */
export const DEFAULT_DAILY_BUDGET_USD = 10;

export async function dailyBudget(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_daily_budget_usd'").first<{
    value: string;
  }>();
  const n = Number(row?.value);
  return row && Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_BUDGET_USD;
}

/** What every paid call of the last 24 hours cost, site-wide. */
export async function spentToday(env: Env): Promise<number> {
  const since = new Date(Date.now() - 86400_000).toISOString();
  const row = await env.DB.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM ai_calls WHERE created_at > ?")
    .bind(since)
    .first<{ usd: number }>();
  return row?.usd ?? 0;
}

/**
 * Once the site has spent its daily budget, paid features wait until tomorrow for everyone but the
 * owners: a burst of sign-ups, or a script, cannot run up the bill.
 */
export async function requireBudget(env: Env, user: { email: string }) {
  if (isOwner(env, user.email)) return;
  if ((await spentToday(env)) >= (await dailyBudget(env)))
    throw new HttpError(503, "budget_spent", "今天全站的 AI 和地图额度用完了，明天再试");
}

export const costRoutes = new Hono<{ Bindings: Env }>();

const requireOwner = async (c: Parameters<typeof requireUser>[0]) => {
  const u = await requireUser(c);
  if (!isOwner(c.env, u.email)) throw new HttpError(403, "forbidden", "只有站长能看开销");
  return u;
};

/**
 * Daily sums by feature and model, all time, in the owner's time zone (`tz` = minutes east of UTC,
 * as the phone knows it). The page rolls them up into 日 / 月 / 季 / 年.
 */
costRoutes.get("/admin/costs", async (c) => {
  await requireOwner(c);
  const tz = Math.max(-840, Math.min(840, Math.round(Number(c.req.query("tz")) || 0)));
  const rows = await c.env.DB.prepare(
    `SELECT substr(datetime(created_at, ? || ' minutes'), 1, 10) AS day, feature, model,
       COUNT(*) AS calls, SUM(ok = 0) AS failed, SUM(input_tokens + cache_read_tokens + cache_write_tokens) AS input,
       SUM(output_tokens) AS output, SUM(web_searches) AS searches, SUM(cost_usd) AS cost
     FROM ai_calls GROUP BY day, feature, model ORDER BY day`,
  )
    .bind(tz >= 0 ? `+${tz}` : String(tz))
    .all<CostDay>();
  return c.json({ days: rows.results });
});

/** The daily budget and what was spent in the last 24 hours. */
costRoutes.get("/admin/budget", async (c) => {
  await requireOwner(c);
  return c.json({ budget: await dailyBudget(c.env), spent: await spentToday(c.env) });
});

costRoutes.post("/admin/budget", async (c) => {
  requireSameOrigin(c);
  await requireOwner(c);
  const n = Number((await readJson(c.req.raw)).budget);
  if (!Number.isFinite(n) || n < 0 || n > 10_000) throw new HttpError(400, "bad_budget", "请填 0 到 10000 之间的数");
  await c.env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('ai_daily_budget_usd', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  )
    .bind(String(n))
    .run();
  return c.json({ budget: n, spent: await spentToday(c.env) });
});

costRoutes.get("/admin/prices", async (c) => {
  await requireOwner(c);
  const rows = await c.env.DB.prepare("SELECT * FROM model_prices ORDER BY model").all<PriceRow>();
  // Models that ran without a price yet, so the page can offer to set one.
  const unpriced = await c.env.DB.prepare(
    "SELECT DISTINCT model FROM ai_calls WHERE model NOT IN (SELECT model FROM model_prices) ORDER BY model",
  ).all<{ model: string }>();
  return c.json({ prices: rows.results.map(toPrice), unpriced: unpriced.results.map((r) => r.model) });
});

const PRICE_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "searchPerK"] as const;

/** Sets one model's prices (new requests from now on); `remove` deletes the line. */
costRoutes.post("/admin/prices", async (c) => {
  requireSameOrigin(c);
  await requireOwner(c);
  const body = await readJson(c.req.raw);
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!/^[\w.-]{1,80}$/.test(model)) throw new HttpError(400, "bad_model", "模型名称无效");
  if (body.remove === true) {
    await c.env.DB.prepare("DELETE FROM model_prices WHERE model = ?").bind(model).run();
    return c.json({ ok: true });
  }
  const v = PRICE_FIELDS.map((k) => Number(body[k] ?? 0));
  if (v.some((n) => !Number.isFinite(n) || n < 0 || n > 10_000))
    throw new HttpError(400, "bad_price", "价格要是 0 或正数");
  await c.env.DB.prepare(
    `INSERT INTO model_prices (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok,
       search_per_k, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (model) DO UPDATE SET input_per_mtok = excluded.input_per_mtok, output_per_mtok = excluded.output_per_mtok,
       cache_read_per_mtok = excluded.cache_read_per_mtok, cache_write_per_mtok = excluded.cache_write_per_mtok,
       search_per_k = excluded.search_per_k, updated_at = excluded.updated_at`,
  )
    .bind(model, ...v, now())
    .run();
  return c.json({ ok: true });
});

/** 按现价重算: every request's cost worked out again from its tokens and today's price table. */
costRoutes.post("/admin/costs/reprice", async (c) => {
  requireSameOrigin(c);
  await requireOwner(c);
  const r = await c.env.DB.prepare(
    `UPDATE ai_calls SET cost_usd = COALESCE((SELECT
       (ai_calls.input_tokens * p.input_per_mtok + ai_calls.output_tokens * p.output_per_mtok
        + ai_calls.cache_read_tokens * p.cache_read_per_mtok + ai_calls.cache_write_tokens * p.cache_write_per_mtok) / 1000000.0
       + ai_calls.web_searches * p.search_per_k / 1000.0
     FROM model_prices p WHERE p.model = ai_calls.model), 0)`,
  ).run();
  return c.json({ ok: true, updated: r.meta.changes });
});
