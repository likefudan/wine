// 模型开销 (我的 → 开销, owners only): what each paid model request cost, and the price table it is
// worked out from. The server keeps one row per request (ai_calls) and sends daily sums; the page
// rolls them up into 日 / 月 / 季 / 年 here, so the same code is tested once.

/** What a request was for. Shown by name on the page; unknown ones show their key. */
export const FEATURES = ["label", "review", "prose"] as const;
export type Feature = (typeof FEATURES)[number];

/** USD per million tokens, and per thousand web searches. */
export interface ModelPrice {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  searchPerK: number;
  updatedAt: string | null;
}

/** Tokens and searches one request used. */
export interface Usage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  searches?: number;
}

/** What a request cost, in USD; a model with no price costs 0 until one is set. */
export function costOf(price: Omit<ModelPrice, "model" | "updatedAt"> | null | undefined, u: Usage): number {
  if (!price) return 0;
  return (
    (u.input * price.input +
      u.output * price.output +
      (u.cacheRead ?? 0) * price.cacheRead +
      (u.cacheWrite ?? 0) * price.cacheWrite) /
      1_000_000 +
    ((u.searches ?? 0) * price.searchPerK) / 1000
  );
}

/** One day's sum for one feature on one model (GET /api/admin/costs). `day` is local: YYYY-MM-DD. */
export interface CostDay {
  day: string;
  feature: string;
  model: string;
  calls: number;
  failed: number;
  input: number;
  output: number;
  searches: number;
  cost: number;
}

export type Period = "day" | "month" | "quarter" | "year";
export const PERIODS: Period[] = ["day", "month", "quarter", "year"];

/** The bucket a local day falls in: 2026-11-18, 2026-11, 2026-Q4, 2026. */
export function bucketOf(day: string, period: Period): string {
  if (period === "day") return day;
  if (period === "month") return day.slice(0, 7);
  if (period === "year") return day.slice(0, 4);
  return `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`;
}

export interface Bucket {
  key: string;
  cost: number;
  calls: number;
  failed: number;
  input: number;
  output: number;
  searches: number;
  byFeature: Record<string, { cost: number; calls: number }>;
  byModel: Record<string, { cost: number; calls: number }>;
}

/** How many buckets back the page shows, newest last; every bucket in range is there, empty or not. */
export const SPAN: Record<Period, number> = { day: 30, month: 12, quarter: 8, year: 5 };

/** The bucket keys ending with today's, oldest first. */
export function recentKeys(period: Period, today: string, n = SPAN[period]): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    if (period === "day") {
      const d = new Date(Date.UTC(y, m - 1, Number(today.slice(8, 10)) - i));
      keys.push(d.toISOString().slice(0, 10));
    } else if (period === "month") {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      keys.push(d.toISOString().slice(0, 7));
    } else if (period === "quarter") {
      const q = y * 4 + Math.ceil(m / 3) - 1 - i;
      keys.push(`${Math.floor(q / 4)}-Q${(q % 4) + 1}`);
    } else keys.push(String(y - i));
  }
  return keys;
}

const empty = (key: string): Bucket => ({
  key,
  cost: 0,
  calls: 0,
  failed: 0,
  input: 0,
  output: 0,
  searches: 0,
  byFeature: {},
  byModel: {},
});

/** The daily sums rolled up: the last SPAN buckets (oldest first), plus anything older for 年. */
export function rollUp(days: CostDay[], period: Period, today: string): Bucket[] {
  const keys = recentKeys(period, today);
  const map = new Map(keys.map((k) => [k, empty(k)]));
  for (const d of days) {
    const key = bucketOf(d.day, period);
    let b = map.get(key);
    if (!b) {
      // Older than the window: only 年 keeps those, so a whole year's total is never cut off.
      if (period !== "year" || key > keys[keys.length - 1]!) continue;
      b = empty(key);
      map.set(key, b);
    }
    b.cost += d.cost;
    b.calls += d.calls;
    b.failed += d.failed;
    b.input += d.input;
    b.output += d.output;
    b.searches += d.searches;
    for (const [split, key] of [
      [b.byFeature, d.feature],
      [b.byModel, d.model],
    ] as const) {
      const x = split[key] ?? { cost: 0, calls: 0 };
      x.cost += d.cost;
      x.calls += d.calls;
      split[key] = x;
    }
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** $0.0123 for small sums, $1.23 from a dollar up. */
export function fmtUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
