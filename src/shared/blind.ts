/**
 * 盲品 (docs/design.zh.md §12): a glass tasted without knowing the wine. It is called by a label (#3)
 * and the colour seen in it; at the end the real wine is filled in (对答案) and the guesses are scored.
 *
 * Until then the tasting, and in a 品鉴 its list item, points at BLIND, a placeholder vintage that
 * the server never sends to the phone, so a blind glass stays out of the 酒库, 成长 and 朋友动态.
 */
import { canonicalGrape } from "./grapes";
import { COLORS, type Guesses, type VintageInfo, type WineColor, nameKey } from "./model";
import { areaNamed, countryOfRegion, normalCountry, tidyPlace } from "./place";

/** The placeholder vintage of a glass whose wine is not known yet (migrations/0016_blind_tasting.sql). */
export const BLIND = "00000000000000000000000000";
export const isBlindId = (vintageId: string | null | undefined) => vintageId === BLIND;

export interface BlindInfo {
  /** What the glass is called while nobody knows: #3, or the taster's own name for it. */
  label: string;
  /** The colour seen in the glass. */
  color: WineColor;
}

export function cleanBlind(v: unknown): BlindInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim().slice(0, 20) : "";
  const color = (COLORS as readonly unknown[]).includes(o.color) ? (o.color as WineColor) : null;
  return label && color ? { label, color } : null;
}

/** The next free #n among the labels already used. */
export function nextLabel(used: readonly string[]): string {
  const taken = new Set(used.map((l) => l.trim()));
  let n = taken.size + 1;
  for (const l of used) {
    const m = /^#(\d+)$/.exec(l.trim());
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  while (taken.has(`#${n}`)) n++;
  return `#${n}`;
}

/** A stand-in vintage for the tasting forms, which only need the colour (and a name for 和上一款比). */
export const blindVintage = (b: BlindInfo): VintageInfo => ({
  id: BLIND,
  wineId: "",
  producer: b.label,
  wine: b.label,
  year: 0,
  color: b.color,
  country: null,
  region: null,
  area: null,
  appellation: null,
  grapes: [],
  abv: null,
});

// ── Guessing the place ───────────────────────────────────────────────────────────────────────

/** The countries offered as one tap, most guessed first. Stored in English, as the wines are. */
export const GUESS_COUNTRIES = [
  "France",
  "Italy",
  "Spain",
  "USA",
  "Australia",
  "Germany",
  "New Zealand",
  "Chile",
  "Argentina",
  "Portugal",
  "South Africa",
  "Austria",
] as const;

/** The 产区 offered once a country is picked. */
export const GUESS_REGIONS: Record<string, readonly string[]> = {
  France: ["Bordeaux", "Burgundy", "Rhone", "Champagne", "Loire", "Alsace", "Beaujolais", "Languedoc", "Provence"],
  Italy: ["Tuscany", "Piedmont", "Veneto", "Sicily"],
  Spain: ["Rioja", "Castilla y Leon", "Catalunya"],
  USA: ["California", "Oregon", "Washington", "New York"],
  Australia: ["South Australia", "Victoria", "Western Australia"],
  Germany: ["Mosel", "Rheingau", "Pfalz"],
  "New Zealand": ["Marlborough", "Central Otago", "Hawke's Bay"],
  Portugal: ["Douro"],
  Argentina: ["Mendoza"],
};

/** The places above as said in Chinese (简体, 繁體), for the chips and for a guess typed that way. */
const PLACE_ZH: Record<string, readonly [string, string]> = {
  France: ["法国", "法國"],
  Italy: ["意大利", "義大利"],
  Spain: ["西班牙", "西班牙"],
  USA: ["美国", "美國"],
  Australia: ["澳大利亚", "澳洲"],
  Germany: ["德国", "德國"],
  "New Zealand": ["新西兰", "紐西蘭"],
  Chile: ["智利", "智利"],
  Argentina: ["阿根廷", "阿根廷"],
  Portugal: ["葡萄牙", "葡萄牙"],
  "South Africa": ["南非", "南非"],
  Austria: ["奥地利", "奧地利"],
  Bordeaux: ["波尔多", "波爾多"],
  Burgundy: ["勃艮第", "布根地"],
  Rhone: ["罗讷河谷", "隆河"],
  Champagne: ["香槟", "香檳"],
  Loire: ["卢瓦尔河谷", "羅亞爾河"],
  Alsace: ["阿尔萨斯", "阿爾薩斯"],
  Beaujolais: ["博若莱", "薄酒萊"],
  Languedoc: ["朗格多克", "隆格多克"],
  Provence: ["普罗旺斯", "普羅旺斯"],
  Tuscany: ["托斯卡纳", "托斯卡尼"],
  Piedmont: ["皮埃蒙特", "皮蒙"],
  Veneto: ["威尼托", "威尼托"],
  Sicily: ["西西里", "西西里"],
  Rioja: ["里奥哈", "利奧哈"],
  "Castilla y Leon": ["卡斯蒂利亚-莱昂", "卡斯提亞-雷昂"],
  Catalunya: ["加泰罗尼亚", "加泰隆尼亞"],
  California: ["加州", "加州"],
  Oregon: ["俄勒冈", "奧勒岡"],
  Washington: ["华盛顿州", "華盛頓州"],
  "New York": ["纽约州", "紐約州"],
  "South Australia": ["南澳", "南澳"],
  Victoria: ["维多利亚", "維多利亞"],
  "Western Australia": ["西澳", "西澳"],
  Mosel: ["摩泽尔", "摩塞爾"],
  Rheingau: ["莱茵高", "萊茵高"],
  Pfalz: ["法尔兹", "法茲"],
  Marlborough: ["马尔堡", "馬爾堡"],
  "Central Otago": ["中奥塔哥", "中奧塔哥"],
  "Hawke's Bay": ["霍克斯湾", "霍克斯灣"],
  Douro: ["杜罗河", "斗羅河"],
  Mendoza: ["门多萨", "門多薩"],
};
/** A place in the reader's language, when we know how it is said; otherwise as stored. */
export const placeName = (en: string, lang: "zh-CN" | "zh-TW" | "en") =>
  lang === "en" ? en : (PLACE_ZH[en]?.[lang === "zh-TW" ? 1 : 0] ?? en);

const ZH_PLACES: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(PLACE_ZH).flatMap(([en, [cn, tw]]) => [
      [cn, en],
      [tw, en],
    ]),
  ),
  澳大利亞: "Australia",
  罗讷河: "Rhone",
  罗纳河: "Rhone",
  卢瓦尔: "Loire",
  加利福尼亚: "California",
  纳帕谷: "Napa Valley",
  納帕谷: "Napa Valley",
  纳帕: "Napa Valley",
  索诺玛: "Sonoma County",
  巴罗萨: "Barossa",
  梅多克: "Médoc",
  左岸: "Médoc",
  圣埃美隆: "Saint-Émilion",
  波美侯: "Pomerol",
  夏布利: "Chablis",
};
const zh = (s: string | undefined) => {
  const x = s?.trim();
  return x ? (ZH_PLACES[x] ?? x) : null;
};

const COUNTRY_KEYS = new Set(GUESS_COUNTRIES.map((c) => nameKey(c)));

/**
 * A guess as country / 产区 / 大区 / 子产区. Old guesses had only `region`, typed: it may be any of them.
 */
export function guessPlace(g: Guesses) {
  let country = zh(g.country);
  let region = zh(g.region);
  let sub = zh(g.sub);
  // A country typed as the 产区 (old free-text guesses): move it up.
  if (!country && region && COUNTRY_KEYS.has(nameKey(region))) {
    country = region;
    region = null;
  }
  // A 大区 or 子产区 typed as the 产区 (an old free-text guess, with no country picked).
  if (region && !country && !countryOfRegion(region) && !sub) {
    sub = region;
    region = null;
  }
  const area = sub && areaNamed(sub) ? sub : null;
  const p = tidyPlace({ country, region, area, appellation: area ? null : sub });
  return { ...p, country: p.country ? normalCountry(p.country) : null };
}

// ── Scoring ───────────────────────────────────────────────────────────────────────────────────

/** Price bands for the guess, in US$ a bottle. */
export const PRICE_BANDS = [
  { id: "u20", lo: 0, hi: 20, label: "< $20" },
  { id: "20-50", lo: 20, hi: 50, label: "$20–50" },
  { id: "50-100", lo: 50, hi: 100, label: "$50–100" },
  { id: "100-200", lo: 100, hi: 200, label: "$100–200" },
  { id: "200+", lo: 200, hi: Number.POSITIVE_INFINITY, label: "$200+" },
] as const;
export const priceBand = (usd: number) => PRICE_BANDS.find((b) => usd >= b.lo && usd < b.hi)!;

export interface Part {
  /** What I guessed, as shown (null: no guess). */
  guess: string | null;
  /** The answer, as shown (null: the wine does not say). */
  answer: string | null;
  got: number;
  /** 0: not scored (the wine does not say). */
  max: number;
}

export interface BlindScore {
  grape: Part;
  place: Part;
  vintage: Part;
  /** Price: right or wrong, not in the total. null when there is no guess or no price. */
  price: { guess: string | null; answer: string | null; ok: boolean | null };
  /** Out of 10 (scaled when the wine leaves something out); null when nothing could be scored. */
  total: number | null;
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && nameKey(a) === nameKey(b);

/** How close the guesses came: grape 4, place 4 (by level), vintage 2 (exact, or 1 within a year). */
export function scoreGuess(g: Guesses, v: VintageInfo, priceUsd: number | null): BlindScore {
  const grapes = v.grapes.map(canonicalGrape);
  const gGrape = g.grape ? canonicalGrape(g.grape) : null;
  const grape: Part = {
    guess: gGrape,
    answer: grapes.length ? grapes.join(" / ") : null,
    got: gGrape && grapes.some((x) => same(x, gGrape)) ? 4 : 0,
    max: grapes.length ? 4 : 0,
  };

  const a = tidyPlace({ country: v.country, region: v.region, area: v.area ?? null, appellation: v.appellation });
  const answerPath = [a.country ? normalCountry(a.country) : null, a.region, a.area, a.appellation];
  const gp = guessPlace(g);
  const guessPath = [gp.country, gp.region, gp.area, gp.appellation];
  const levels = answerPath.filter(Boolean).length;
  let hit = 0;
  for (let i = 0; i < 4; i++) {
    if (!answerPath[i]) continue;
    if (!same(guessPath[i], answerPath[i])) break;
    hit++;
  }
  const place: Part = {
    guess: guessPath.filter(Boolean).join(" · ") || null,
    answer: answerPath.filter(Boolean).join(" · ") || null,
    got: levels ? Math.round((4 * hit) / levels) : 0,
    max: levels ? 4 : 0,
  };

  const off = g.vintage !== undefined && v.year ? Math.abs(g.vintage - v.year) : null;
  const vintage: Part = {
    guess: g.vintage !== undefined ? String(g.vintage) : null,
    answer: v.year ? String(v.year) : null,
    got: off === 0 ? 2 : off === 1 ? 1 : 0,
    max: v.year ? 2 : 0,
  };

  const band = g.price ? PRICE_BANDS.find((b) => b.id === g.price) : undefined;
  const price = {
    guess: band?.label ?? null,
    answer: priceUsd !== null ? `$${Math.round(priceUsd)}` : null,
    ok: band && priceUsd !== null ? priceBand(priceUsd).id === band.id : null,
  };

  const max = grape.max + place.max + vintage.max;
  const got = grape.got + place.got + vintage.got;
  return { grape, place, vintage, price, total: max ? Math.round((10 * got) / max) : null };
}

/** A shared list's glass as the forms show it: its wine, or while that is hidden, its label. */
export const shownVintage = (i: { vintage: VintageInfo | null; blind?: BlindInfo | null }): VintageInfo =>
  i.vintage ?? blindVintage(i.blind ?? { label: "?", color: "red" });
