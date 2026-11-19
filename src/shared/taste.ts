/**
 * 第四期 推荐 (docs/design.zh.md §6, §11): explainable statistics over my own notes, no trained model
 * and no AI call. Worked out on the phone from its own copy, so it is free and works offline.
 *
 * - 口味画像: how much each grape, place, colour, producer, aroma family and structure level moves
 *   "我的评分" away from my own average. Shrunk towards 0, so one great bottle doesn't make a rule.
 * - 我与评论家: my score minus the critics' on the same wines, overall and by grape / colour.
 * - 今晚开哪瓶: my cellar, ranked by how urgent the drinking window is, how much I should like it
 *   and the occasion.
 * - 下一款试试: wines I have not had (from the shared catalogue and LWIN, GET /api/recs), ranked with
 *   the same profile, plus one 进阶 step (src/shared/stretch.ts).
 */

import { type CellarLot, type DrinkWindow, type ProWindow, type WindowStatus, windowOf, windowStatus } from "./cellar";
import { DESCRIPTOR_BY_ID } from "./descriptors";
import { canonicalGrape } from "./grapes";
import { isFilled } from "./growth";
import type { Tasting, VintageInfo, WineColor } from "./model";
import { normalCountry } from "./place";
import { scoreNumbers } from "./reviews";
import type { Stretch } from "./stretch";

export type FeatureKind = "grape" | "country" | "region" | "area" | "color" | "producer" | "family";

export interface Feature {
  kind: FeatureKind;
  /** English grape, place as stored, colour id, producer name, aroma family id. */
  key: string;
  /** Wines that have it. */
  n: number;
  /** My average score on them. */
  avg: number;
  /** Points above (or below) my own average, shrunk by how few wines there are. */
  delta: number;
}

export const STRUCT_DIMS = ["sweetness", "acidity", "tannin", "body"] as const;
export type StructDim = (typeof STRUCT_DIMS)[number];
export type Band = "low" | "mid" | "high";
export interface StructPref {
  dim: StructDim;
  band: Band;
  n: number;
  delta: number;
}

export interface CriticGap {
  kind: "all" | "grape" | "color";
  key: string;
  n: number;
  /** My score minus the critics' average, shrunk. */
  gap: number;
}

/** The critics' and the community's score for one vintage, from the shared pro-review lookup (sync only). */
export interface ProScore {
  vintageId: string;
  /** Average of the critics' 100-point scores ("97-99" counts as 98; 20-point scores are left out). */
  critic: number | null;
  /** CellarTracker's community average. */
  community: number | null;
}

/** How far to trust it: none < 3 scored wines, early < 15, growing < 50, solid from 50 (§6: 约 50 条后才准). */
export type Confidence = "none" | "early" | "growing" | "solid";

export interface TasteProfile {
  /** Wines with a score (a wine scored twice counts once, at its average). */
  scored: number;
  baseline: number;
  confidence: Confidence;
  /** Every feature with at least two wines, highest delta first. */
  features: Feature[];
  likes: Feature[];
  dislikes: Feature[];
  structure: StructPref[];
  gaps: CriticGap[];
  /** My average score per wine (wineId). */
  myWines: Map<string, { avg: number; n: number }>;
  /** Grapes I have had at all, scored or not. */
  triedGrapes: Set<string>;
}

/** How many wines' worth of "my average" each feature starts with: 2 wines at +6 show as +3. */
const SHRINK = 2;
const MIN_N = 2;
const LIKE = 1.5;

export const confidenceOf = (scored: number): Confidence =>
  scored < 3 ? "none" : scored < 15 ? "early" : scored < 50 ? "growing" : "solid";

const bandOf = (dim: StructDim, v: number): Band =>
  dim === "sweetness" ? (v <= 1 ? "low" : v <= 3 ? "mid" : "high") : v <= 2 ? "low" : v === 3 ? "mid" : "high";

const featureKey = (kind: FeatureKind, key: string) => `${kind}:${key}`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** What a wine is, as features: its grapes, places, colour and producer. */
export function featuresOf(v: {
  grapes: string[];
  country: string | null;
  region: string | null;
  area?: string | null;
  color: WineColor | null;
  producer: string;
}): [FeatureKind, string][] {
  const out: [FeatureKind, string][] = [];
  for (const g of new Set(v.grapes.map(canonicalGrape))) if (g) out.push(["grape", g]);
  if (v.country) out.push(["country", normalCountry(v.country)]);
  if (v.region) out.push(["region", v.region]);
  if (v.area && v.area !== v.region) out.push(["area", v.area]);
  if (v.color) out.push(["color", v.color]);
  if (v.producer.trim()) out.push(["producer", v.producer.trim()]);
  return out;
}

/** A pro review's critics as one 100-point number, or null. */
export function criticAverage(scores: { score: string }[]): number | null {
  const nums = scores.flatMap((c) => {
    if (/\/20$/.test(c.score)) return [];
    const ns = scoreNumbers(c.score).map(Number);
    if (!ns.length) return [];
    const x = mean(ns);
    return x >= 50 && x <= 100 ? [x] : [];
  });
  return nums.length ? round1(mean(nums)) : null;
}

export function tasteProfile(
  tastings: readonly Tasting[],
  vintages: readonly VintageInfo[],
  pro: readonly ProScore[] = [],
): TasteProfile {
  const vById = new Map(vintages.map((v) => [v.id, v]));
  const triedGrapes = new Set<string>();
  for (const t of tastings) {
    if (!isFilled(t)) continue;
    for (const g of vById.get(t.vintageId)?.grapes ?? []) triedGrapes.add(canonicalGrape(g));
  }

  // One entry per wine: its average score, aroma families and the last structure I gave it.
  interface WineSum {
    v: VintageInfo;
    scores: number[];
    families: Set<string>;
    struct: Partial<Record<StructDim, number>>;
    byVintage: Map<string, number[]>;
    at: string;
  }
  const wines = new Map<string, WineSum>();
  const sorted = [...tastings].sort((a, b) => a.tastedAt.localeCompare(b.tastedAt));
  for (const t of sorted) {
    if (t.score === null) continue;
    const v = vById.get(t.vintageId);
    if (!v) continue;
    const w: WineSum = wines.get(v.wineId) ?? {
      v,
      scores: [],
      families: new Set(),
      struct: {},
      byVintage: new Map(),
      at: t.tastedAt,
    };
    w.scores.push(t.score);
    w.byVintage.set(v.id, [...(w.byVintage.get(v.id) ?? []), t.score]);
    for (const d of [...t.descriptors.map((x) => x.id), ...(t.palate.flavours ?? [])]) {
      const fam = DESCRIPTOR_BY_ID.get(d)?.family;
      if (fam) w.families.add(fam);
    }
    for (const dim of STRUCT_DIMS) {
      const x = t.palate[dim];
      if (typeof x === "number") w.struct[dim] = x;
    }
    w.at = t.tastedAt;
    wines.set(v.wineId, w);
  }

  const list = [...wines.values()].map((w) => ({ ...w, avg: mean(w.scores) }));
  const baseline = list.length ? round1(mean(list.map((w) => w.avg))) : 0;
  const acc = new Map<string, { kind: FeatureKind; key: string; devs: number[]; scores: number[] }>();
  const add = (kind: FeatureKind, key: string, score: number) => {
    const k = featureKey(kind, key);
    const a = acc.get(k) ?? { kind, key, devs: [], scores: [] };
    a.devs.push(score - baseline);
    a.scores.push(score);
    acc.set(k, a);
  };
  const structAcc = new Map<string, { dim: StructDim; band: Band; devs: number[] }>();
  for (const w of list) {
    for (const [kind, key] of featuresOf(w.v)) add(kind, key, w.avg);
    for (const f of w.families) add("family", f, w.avg);
    for (const dim of STRUCT_DIMS) {
      const x = w.struct[dim];
      if (x === undefined) continue;
      const band = bandOf(dim, x);
      const k = `${dim}:${band}`;
      const a = structAcc.get(k) ?? { dim, band, devs: [] };
      a.devs.push(w.avg - baseline);
      structAcc.set(k, a);
    }
  }
  const shrunk = (devs: number[]) => round1(devs.reduce((a, b) => a + b, 0) / (devs.length + SHRINK));
  const features: Feature[] = [...acc.values()]
    .filter((a) => a.devs.length >= MIN_N)
    .map((a) => ({ kind: a.kind, key: a.key, n: a.devs.length, avg: round1(mean(a.scores)), delta: shrunk(a.devs) }))
    .sort((a, b) => b.delta - a.delta || b.n - a.n);

  // A wider place that says nothing more than a narrower one (USA = California = Napa Valley, same
  // wines) is left out of what the page lists; it still counts for guesses.
  const PLACE_DEPTH: Partial<Record<FeatureKind, number>> = { country: 0, region: 1, area: 2 };
  const shown = features.filter((f) => {
    const d = PLACE_DEPTH[f.kind];
    return (
      d === undefined || !features.some((g) => (PLACE_DEPTH[g.kind] ?? -1) > d && g.n === f.n && g.delta === f.delta)
    );
  });

  // Per dimension, the band I score highest, when it stands out.
  const structure: StructPref[] = [];
  for (const dim of STRUCT_DIMS) {
    const best = [...structAcc.values()]
      .filter((a) => a.dim === dim && a.devs.length >= MIN_N)
      .map((a) => ({ dim, band: a.band, n: a.devs.length, delta: shrunk(a.devs) }))
      .sort((a, b) => b.delta - a.delta)[0];
    if (best && best.delta >= LIKE) structure.push(best);
  }

  // 我与评论家: on each vintage the critics scored, my average there minus theirs.
  const proBy = new Map(pro.map((p) => [p.vintageId, p]));
  const gapAcc = new Map<string, { kind: CriticGap["kind"]; key: string; diffs: number[] }>();
  const addGap = (kind: CriticGap["kind"], key: string, d: number) => {
    const k = `${kind}:${key}`;
    const a = gapAcc.get(k) ?? { kind, key, diffs: [] };
    a.diffs.push(d);
    gapAcc.set(k, a);
  };
  for (const w of list)
    for (const [vid, scores] of w.byVintage) {
      const critic = proBy.get(vid)?.critic;
      if (critic === null || critic === undefined) continue;
      const d = mean(scores) - critic;
      addGap("all", "", d);
      addGap("color", w.v.color, d);
      for (const g of new Set(w.v.grapes.map(canonicalGrape))) addGap("grape", g, d);
    }
  const gaps: CriticGap[] = [...gapAcc.values()]
    .map((a) => ({
      kind: a.kind,
      key: a.key,
      n: a.diffs.length,
      gap: round1(a.diffs.reduce((x, y) => x + y, 0) / (a.diffs.length + 1)),
    }))
    .filter((g) => g.kind === "all" || g.n >= MIN_N)
    .sort((a, b) => (a.kind === "all" ? -1 : b.kind === "all" ? 1 : Math.abs(b.gap) - Math.abs(a.gap)));

  return {
    scored: list.length,
    baseline,
    confidence: confidenceOf(list.length),
    features,
    likes: shown.filter((f) => f.delta >= LIKE).slice(0, 10),
    dislikes: shown
      .filter((f) => f.delta <= -LIKE)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 6),
    structure,
    gaps,
    myWines: new Map(list.map((w) => [w.v.wineId, { avg: round1(w.avg), n: w.scores.length }])),
    triedGrapes,
  };
}

/** How much each kind of feature counts towards a guess: a grape or a producer says the most. */
const WEIGHT: Record<FeatureKind, number> = {
  grape: 1,
  producer: 1,
  area: 0.8,
  region: 0.6,
  country: 0.4,
  color: 0.5,
  family: 0,
};

export interface Guess {
  /** Points above my average I would probably give it (my own average when I have had this wine). */
  lift: number;
  /** My average on this very wine (another bottle or vintage), when I have one. */
  mine: number | null;
  /** What I like about it, strongest first. */
  why: Feature[];
}

/** How much I should like a wine, from my profile and, when there is one, the critics' score. */
export function guess(
  profile: TasteProfile,
  w: {
    wineId?: string | null;
    grapes: string[];
    country: string | null;
    region: string | null;
    area?: string | null;
    color: WineColor | null;
    producer: string;
    critic?: number | null;
  },
): Guess {
  const byKey = new Map(profile.features.map((f) => [featureKey(f.kind, f.key), f]));
  const mine = w.wineId ? (profile.myWines.get(w.wineId)?.avg ?? null) : null;
  const matched = featuresOf(w)
    .map(([k, key]) => byKey.get(featureKey(k, key)))
    .filter((f): f is Feature => !!f);
  // Several grapes count as their average, not their sum.
  const grapes = matched.filter((f) => f.kind === "grape");
  let lift = grapes.length ? mean(grapes.map((f) => f.delta)) : 0;
  for (const f of matched) if (f.kind !== "grape") lift += f.delta * WEIGHT[f.kind];
  if (typeof w.critic === "number") {
    const gap = criticGapFor(profile, w);
    // With my gap known, what I would give it next to my average; without, only a nudge from 90.
    lift += gap === null ? (w.critic - 90) * 0.3 : (w.critic + gap - profile.baseline) * 0.5;
  }
  lift = Math.max(-12, Math.min(12, lift));
  if (mine !== null) lift = mine - profile.baseline;
  const why = matched.filter((f) => f.delta >= LIKE && f.kind !== "color").sort((a, b) => b.delta - a.delta);
  return { lift: round1(lift), mine, why };
}

/** My gap to the critics for this kind of wine: its grape, else its colour, else overall. */
export function criticGapFor(profile: TasteProfile, w: { grapes: string[]; color: WineColor | null }): number | null {
  const find = (kind: CriticGap["kind"], key: string) => profile.gaps.find((g) => g.kind === kind && g.key === key);
  for (const g of w.grapes.map(canonicalGrape)) {
    const x = find("grape", g);
    if (x) return x.gap;
  }
  const c = w.color ? find("color", w.color) : undefined;
  if (c) return c.gap;
  return find("all", "")?.gap ?? null;
}

// ── 今晚开哪瓶 ─────────────────────────────────────────────────────────────────────────────────

export const OCCASIONS = ["any", "weeknight", "special", "light", "rich"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export type TonightReason =
  | { k: "past" | "last" | "entering" | "ready" | "wait" }
  | { k: "mine"; score: number }
  | { k: "like"; f: Feature }
  | { k: "many"; qty: number }
  | { k: "everyday" | "treat" | "light" | "rich" };

export interface TonightPick {
  lot: CellarLot;
  v: VintageInfo;
  window: DrinkWindow | null;
  status: WindowStatus;
  reasons: TonightReason[];
  rank: number;
}

/** The window comes first: a bottle past it or in its last year should be opened whatever my taste says. */
const URGENCY: Record<WindowStatus, number> = { past: 10, last: 8, ready: 3, unknown: 0, wait: -10 };
/** How far my taste can move a bottle up or down. */
const TASTE_CAP = 5;
const LIGHT = new Set<WineColor>(["white", "rose", "sparkling"]);

export function tonightPicks(
  lots: readonly CellarLot[],
  vintages: readonly VintageInfo[],
  tastings: readonly Tasting[],
  proWindows: readonly ProWindow[],
  profile: TasteProfile,
  occasion: Occasion = "any",
  year = new Date().getFullYear(),
  count = 3,
): TonightPick[] {
  const vById = new Map(vintages.map((v) => [v.id, v]));
  const proBy = new Map(proWindows.map((w) => [w.vintageId, w]));
  const full = lots.filter((l) => l.qty > 0 && vById.has(l.vintageId));
  // What a bottle costs next to my other bottles in the same currency.
  const medians = new Map<string, number>();
  for (const c of new Set(full.map((l) => l.currency).filter((c): c is string => !!c))) {
    const ps = full
      .filter((l) => l.currency === c && l.price !== null)
      .map((l) => l.price!)
      .sort((a, b) => a - b);
    if (ps.length) medians.set(c, ps[Math.floor(ps.length / 2)]!);
  }
  const picks = full.map((lot): TonightPick => {
    const v = vById.get(lot.vintageId)!;
    const w = windowOf(lot, proBy.get(lot.vintageId), tastings as Tasting[]);
    const status = windowStatus(w, year);
    const g = guess(profile, v);
    const reasons: TonightReason[] = [];
    const taste = Math.max(-TASTE_CAP, Math.min(TASTE_CAP, g.lift * (occasion === "special" ? 1 : 0.6)));
    let rank = URGENCY[status] + taste;
    if (status === "ready" && w?.from === year) reasons.push({ k: "entering" });
    else if (status !== "unknown") reasons.push({ k: status });
    if (g.mine !== null) reasons.push({ k: "mine", score: Math.round(g.mine) });
    else if (g.why[0]) reasons.push({ k: "like", f: g.why[0] });
    const median = lot.currency ? medians.get(lot.currency) : undefined;
    const price = lot.price;
    if (occasion === "weeknight") {
      if (price !== null && median !== undefined) {
        if (price <= median) {
          rank += 3;
          reasons.push({ k: "everyday" });
        } else if (price > median * 1.5) rank -= 4;
      }
      if (lot.qty >= 3) {
        rank += 1.5;
        reasons.push({ k: "many", qty: lot.qty });
      }
    } else if (occasion === "special") {
      if (price !== null && median !== undefined && price > median) {
        rank += 3 + Math.min(3, price / median - 1);
        reasons.push({ k: "treat" });
      }
    } else if (occasion === "light") {
      if (LIGHT.has(v.color)) {
        rank += 5;
        reasons.push({ k: "light" });
      } else if (v.color === "red") rank -= 4;
    } else if (occasion === "rich") {
      if (v.color === "red") {
        rank += 4;
        reasons.push({ k: "rich" });
      } else if (LIGHT.has(v.color)) rank -= 4;
    } else if (lot.qty >= 3 && status !== "wait") {
      rank += 0.5;
      reasons.push({ k: "many", qty: lot.qty });
    }
    return { lot, v, window: w, status, reasons: reasons.slice(0, 3), rank: round1(rank) };
  });
  // One lot per vintage; a bottle still waiting only when nothing else is left.
  const seen = new Set<string>();
  return picks
    .sort((a, b) => b.rank - a.rank || (a.window?.to ?? 9999) - (b.window?.to ?? 9999))
    .filter((p) => !seen.has(p.v.id) && !!seen.add(p.v.id))
    .slice(0, count);
}

// ── 下一款试试 ─────────────────────────────────────────────────────────────────────────────────

/** GET /api/recs: what to look for, from the profile. Short lists keep the query cheap. */
export interface RecsQuery {
  grapes: string[];
  regions: string[];
  areas: string[];
  producers: string[];
  /** The 进阶 step's places (LWIN appellations or regions) and grape. */
  stretch: { grape: string; places: string[]; color: WineColor } | null;
  /** Changes the LWIN sample: the day, plus 换一批. */
  seed: number;
}

/** One wine I have not had, from the shared catalogue or LWIN. */
export interface Candidate {
  /** wine id (catalogue) or `lwin:<n>` */
  key: string;
  source: "catalog" | "lwin";
  wineId: string | null;
  lwin: number | null;
  producer: string;
  wine: string;
  color: WineColor | null;
  country: string | null;
  region: string | null;
  area: string | null;
  appellation: string | null;
  grapes: string[];
  /** The newest vintage of it with a pro-review lookup, and what that found. */
  year: number | null;
  critic: number | null;
  community: number | null;
  /** Found for the 进阶 step. */
  stretch: boolean;
}

export function recsQuery(profile: TasteProfile, stretch: Stretch | null, seed: number): RecsQuery {
  const top = (kind: FeatureKind, n: number) =>
    profile.features
      .filter((f) => f.kind === kind && f.delta > 0)
      .slice(0, n)
      .map((f) => f.key);
  return {
    grapes: top("grape", 5),
    regions: top("region", 4),
    areas: top("area", 4),
    producers: top("producer", 3),
    stretch: stretch ? { grape: stretch.grape, places: stretch.places, color: stretch.color } : null,
    seed,
  };
}

export interface NextPick {
  c: Candidate;
  lift: number;
  why: Feature[];
}

/**
 * The best few, at most one per producer and two per region, so the list is not five wines from one
 * estate. Wines the critics scored rank a little higher: there is more to go on.
 */
export function nextPicks(profile: TasteProfile, candidates: readonly Candidate[], count = 5): NextPick[] {
  const scored = candidates
    .filter((c) => !c.stretch)
    .map((c) => {
      const g = guess(profile, c);
      return { c, lift: g.lift, why: g.why, rank: g.lift + (c.critic !== null ? 1 : 0) + (c.grapes.length ? 0.5 : 0) };
    })
    .filter((p) => p.why.length > 0)
    .sort((a, b) => b.rank - a.rank);
  const producers = new Set<string>();
  const regions = new Map<string, number>();
  const out: NextPick[] = [];
  for (const p of scored) {
    const prod = p.c.producer.toLowerCase();
    const reg = p.c.area ?? p.c.region ?? "";
    if (producers.has(prod) || (reg && (regions.get(reg) ?? 0) >= 2)) continue;
    producers.add(prod);
    regions.set(reg, (regions.get(reg) ?? 0) + 1);
    out.push({ c: p.c, lift: p.lift, why: p.why });
    if (out.length >= count) break;
  }
  return out;
}

/** For the 进阶 step: a candidate made from its grape, critics' choice first. */
export const stretchWines = (candidates: readonly Candidate[], count = 2): Candidate[] =>
  candidates
    .filter((c) => c.stretch)
    .sort((a, b) => (b.critic ?? 0) - (a.critic ?? 0))
    .slice(0, count);

/** Today as a number (2026-11-18 → 20261118): the same list all day, a new one tomorrow. */
export const daySeed = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
