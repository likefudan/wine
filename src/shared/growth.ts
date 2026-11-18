import type { Depth, Tasting, VintageInfo } from "./model";

/**
 * 成长记录 (docs/design.zh.md §3.4): what my notes say about how I taste and how that changes —
 * the aromas I have learned to name, the grapes and places I have tried, and month by month how
 * many wines, how many aroma words per wine and at which depth. Worked out on the phone from its own
 * copy.
 */

export interface MonthGrowth {
  /** 2026-11 */
  month: string;
  wines: number;
  /** Aroma and flavour words per note, on average: how much I find in a glass. */
  wordsPerWine: number;
  /** Aroma words named for the first time this month. */
  newWords: string[];
  avgScore: number | null;
  /** The depth used most this month. */
  depth: Depth;
}

export interface Growth {
  wines: number;
  firstAt: string | null;
  /** Every aroma word I have used, most used first. */
  words: { id: string; n: number }[];
  /** Grapes (English names), most tasted first. */
  grapes: { name: string; n: number }[];
  countries: { name: string; n: number }[];
  regions: number;
  /** Oldest month first; months with no notes are left out. */
  months: MonthGrowth[];
  byDepth: Record<Depth, number>;
}

const counted = (m: Map<string, number>) =>
  [...m].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

/** The words a note names: its aromas and its palate flavours, each once. */
const wordsOf = (t: Tasting) => [...new Set([...t.descriptors.map((d) => d.id), ...(t.palate.flavours ?? [])])];

/** A note counts once something is in it: a score, a word, an answer or a line. */
export const isFilled = (t: Tasting) =>
  t.score !== null ||
  t.descriptors.length > 0 ||
  !!t.note ||
  Object.keys(t.palate).length > 0 ||
  Object.keys(t.nose).length > 0 ||
  t.appearance.hue !== undefined;

interface MonthSum {
  wines: number;
  words: number;
  scores: number[];
  newWords: string[];
  depths: Map<string, number>;
}

export function growthOf(tastings: readonly Tasting[], vintages: readonly VintageInfo[]): Growth {
  const byId = new Map(vintages.map((v) => [v.id, v]));
  const notes = tastings.filter(isFilled).sort((a, b) => a.tastedAt.localeCompare(b.tastedAt));
  const words = new Map<string, number>();
  const grapes = new Map<string, number>();
  const countries = new Map<string, number>();
  const regions = new Set<string>();
  const byDepth: Record<Depth, number> = { quick: 0, beginner: 0, standard: 0, expert: 0 };
  const months = new Map<string, MonthSum>();
  const seenWines = new Set<string>();
  for (const t of notes) {
    const v = byId.get(t.vintageId);
    const ws = wordsOf(t);
    const month = t.tastedAt.slice(0, 7);
    const m: MonthSum = months.get(month) ?? { wines: 0, words: 0, scores: [], newWords: [], depths: new Map() };
    m.wines++;
    m.words += ws.length;
    if (t.score !== null) m.scores.push(t.score);
    bump(m.depths, t.depth);
    for (const w of ws) {
      if (!words.has(w)) m.newWords.push(w);
      bump(words, w);
    }
    months.set(month, m);
    byDepth[t.depth] = (byDepth[t.depth] ?? 0) + 1;
    // A wine tasted twice counts once for grapes and places.
    if (v && !seenWines.has(v.wineId)) {
      seenWines.add(v.wineId);
      for (const g of v.grapes) bump(grapes, g);
      if (v.country) bump(countries, v.country);
      if (v.region) regions.add(`${v.country ?? ""}/${v.region}`);
    }
  }
  return {
    wines: notes.length,
    firstAt: notes[0]?.tastedAt ?? null,
    words: counted(words).map(({ k, n }) => ({ id: k, n })),
    grapes: counted(grapes).map(({ k, n }) => ({ name: k, n })),
    countries: counted(countries).map(({ k, n }) => ({ name: k, n })),
    regions: regions.size,
    byDepth,
    months: [...months].map(([month, m]) => ({
      month,
      wines: m.wines,
      wordsPerWine: Math.round((m.words / m.wines) * 10) / 10,
      newWords: m.newWords,
      avgScore: m.scores.length ? Math.round((m.scores.reduce((a, b) => a + b, 0) / m.scores.length) * 10) / 10 : null,
      depth: counted(m.depths)[0]!.k as Depth,
    })),
  };
}

/** 入门记满大约 10 款后，提示可以试试进阶 (§3.4). */
export const READY_FOR_STANDARD = 10;
export const suggestStandard = (g: Growth, defaultDepth: Depth | null) =>
  (defaultDepth === "beginner" || defaultDepth === "quick") && g.byDepth.beginner >= READY_FOR_STANDARD;
