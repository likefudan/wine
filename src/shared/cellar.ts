/**
 * 酒窖 (docs/design.zh.md §6, 第三期): the bottles I keep. One row ("lot") is one purchase of one
 * wine and vintage: how many are left, how big, where they are, what they cost and when to drink
 * them. Opening a bottle takes one off and starts a tasting that points back at the lot, so 喝掉一瓶 =
 * 记一杯. Kept on the phone like everything else and sent up as ops.
 */

import type { Extra, Lang, Tasting } from "./model";

export interface CellarLot {
  id: string;
  vintageId: string;
  /** Bottles left; 0 = all drunk (kept as history). */
  qty: number;
  sizeMl: number;
  /** Where they are: "家·酒柜第 3 层", "Vinfolio". */
  location: string | null;
  /** YYYY-MM-DD */
  boughtOn: string | null;
  /** Per bottle, in `currency`. */
  price: number | null;
  /** ISO 4217: CNY, USD, TWD… */
  currency: string | null;
  /** Where it was bought: a winery, a shop, a friend. */
  source: string | null;
  /** My own drinking window (years); null = not set (the critics' or my notes' window is used). */
  drinkFrom: number | null;
  drinkTo: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The drinking window a pro-review lookup gave for one vintage (sync only, read-only). */
export interface ProWindow {
  vintageId: string;
  from: number | null;
  to: number | null;
  /** "2027-2045", as found. */
  text: string;
}

export const BOTTLE_SIZES = [187, 375, 500, 750, 1500, 3000] as const;
export const DEFAULT_SIZE = 750;
export const MAX_QTY = 9999;

export const CURRENCIES = ["CNY", "USD", "TWD", "HKD", "EUR", "GBP", "JPY", "AUD", "CAD", "SGD"] as const;
export const isCurrency = (v: unknown): v is string =>
  typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);

/** The currency a new lot starts with when I have none yet: the one people of that language most likely use. */
export const defaultCurrency = (lang: Lang): string => (lang === "zh-CN" ? "CNY" : lang === "zh-TW" ? "TWD" : "USD");

/** "¥320", "NT$1,200", "$85": the price of one bottle. */
export function fmtPrice(price: number, currency: string | null, lang: Lang): string {
  const locale = lang === "en" ? "en-US" : lang;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: price % 1 ? 2 : 0,
    }).format(price);
  } catch {
    return `${price} ${currency ?? ""}`.trim();
  }
}

const YEAR_RE = /(?:19|20)\d{2}/g;

/**
 * A critic's window as two years: "2027-2045", "2027–2045", "2030+", "now-2035", "through 2035".
 * null when it names no year.
 */
export function parseWindow(text: string | null | undefined): { from: number | null; to: number | null } | null {
  if (!text) return null;
  const years = (text.match(YEAR_RE) ?? []).map(Number);
  if (!years.length) return null;
  if (years.length >= 2) {
    const [a, b] = [years[0]!, years[years.length - 1]!];
    return { from: Math.min(a, b), to: Math.max(a, b) };
  }
  const y = years[0]!;
  const t = text.toLowerCase();
  if (/(now|today|现在|現在|即饮|即飲|until|through|thru|by|before|至|到|之前)/.test(t) || /^\s*[-–—~]/.test(t))
    return { from: null, to: y };
  return { from: y, to: null };
}

/**
 * Where the drinking window comes from: what I set on the lot, else the critics (pro-review lookup),
 * else what I wrote in a note on this vintage (专业: 适饮期).
 */
export type WindowSource = "mine" | "critics" | "notes";
export interface DrinkWindow {
  from: number | null;
  to: number | null;
  source: WindowSource;
}

export function windowOf(
  lot: Pick<CellarLot, "drinkFrom" | "drinkTo" | "vintageId">,
  pro: ProWindow | undefined,
  tastings: Pick<Tasting, "vintageId" | "extra" | "tastedAt">[],
): DrinkWindow | null {
  if (lot.drinkFrom !== null || lot.drinkTo !== null) return { from: lot.drinkFrom, to: lot.drinkTo, source: "mine" };
  if (pro && (pro.from !== null || pro.to !== null)) return { from: pro.from, to: pro.to, source: "critics" };
  const noted = tastings
    .filter((x) => x.vintageId === lot.vintageId && hasWindow(x.extra))
    .sort((a, b) => b.tastedAt.localeCompare(a.tastedAt))[0];
  if (noted) return { from: noted.extra.drinkFrom ?? null, to: noted.extra.drinkTo ?? null, source: "notes" };
  return null;
}

const hasWindow = (e: Extra | undefined) =>
  !!e && ((typeof e.drinkFrom === "number" && e.drinkFrom > 0) || (typeof e.drinkTo === "number" && e.drinkTo > 0));

/**
 * Where a lot stands this year:
 * - past: the window ended before this year;
 * - last: this is the window's last year;
 * - ready: in the window (or it has no start and has not ended);
 * - wait: the window starts later;
 * - unknown: no window anywhere.
 */
export type WindowStatus = "past" | "last" | "ready" | "wait" | "unknown";

export function windowStatus(w: DrinkWindow | null, year = new Date().getFullYear()): WindowStatus {
  if (!w || (w.from === null && w.to === null)) return "unknown";
  if (w.to !== null && year > w.to) return "past";
  if (w.to !== null && year === w.to) return "last";
  if (w.from !== null && year < w.from) return "wait";
  return "ready";
}

/** The order the 酒窖 page shows its groups in: what needs drinking first. */
export const STATUS_ORDER: WindowStatus[] = ["past", "last", "ready", "wait", "unknown"];

/** "2027–2045", "2030 起", "至 2035". */
export function windowLabel(w: { from: number | null; to: number | null }, lang: Lang): string {
  if (w.from !== null && w.to !== null) return w.from === w.to ? String(w.from) : `${w.from}–${w.to}`;
  if (w.from !== null) return lang === "en" ? `from ${w.from}` : `${w.from} 起`;
  if (w.to !== null) return lang === "en" ? `until ${w.to}` : `至 ${w.to}`;
  return "";
}

/** Bottles of each size, summed: "12 瓶" counts a magnum as one bottle, as people do. */
export function bottleCount(lots: Pick<CellarLot, "qty">[]): number {
  return lots.reduce((n, l) => n + Math.max(0, l.qty), 0);
}

/**
 * 适饮期提醒: a lot entering its window this year, in its last year, or past it. `key` changes with the
 * year and the kind, so each is shown once (src/web/CellarAlerts.tsx).
 */
export type AlertKind = "entering" | "last" | "past";

export interface CellarAlert {
  lot: CellarLot;
  kind: AlertKind;
  key: string;
}

export function cellarAlerts(
  lots: CellarLot[],
  pro: ProWindow[],
  tastings: Pick<Tasting, "vintageId" | "extra" | "tastedAt">[],
  year = new Date().getFullYear(),
): CellarAlert[] {
  const byVintage = new Map(pro.map((w) => [w.vintageId, w]));
  return lots.flatMap((lot): CellarAlert[] => {
    if (lot.qty <= 0) return [];
    const w = windowOf(lot, byVintage.get(lot.vintageId), tastings);
    const s = windowStatus(w, year);
    const kind: AlertKind | null =
      s === "past" ? "past" : s === "last" ? "last" : s === "ready" && w?.from === year ? "entering" : null;
    return kind ? [{ lot, kind, key: `${lot.id}:${kind}:${year}` }] : [];
  });
}
