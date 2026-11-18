/**
 * 专业评价 (docs/design.zh.md §3.2): what one wine's pro reviews look like on the wire, the prompt
 * people copy into their own AI ("用自己的 AI 查"), and the parser for what they paste back. Shared by
 * the Worker (which checks and stores) and the page (which builds the prompt).
 */
import { DESCRIPTORS, type Tri } from "./descriptors";
import type { Lang } from "./model";

export interface CriticScore {
  /** Wine Advocate, Vinous… */
  publication: string;
  /** The person, when the source names one: a publication often has several. */
  reviewer: string | null;
  /** As printed: "97", "97-99", "98+", "17.5/20". Never averaged, never estimated. */
  score: string;
  url: string;
  /** Set when the score is quoted by someone else (a retailer): "wine.com". */
  via: string | null;
}

export interface ProReview {
  critics: CriticScore[];
  /** CellarTracker's community average. */
  community: { avg: number; count: number | null; url: string } | null;
  /** Wine-Searcher's average price, US dollars. */
  price: { usd: number; url: string } | null;
  drinkWindow: string | null;
  /** Ids from the aroma vocabulary (src/shared/descriptors.ts), at most 8. */
  aromas: string[];
  /** Our own words, never a critic's: three sentences at most. */
  summary: Tri | null;
  /** The wine's page on each site, or a search there when it wasn't found. */
  links: { wineSearcher: string; cellarTracker: string };
}

/** GET /api/reviews/:vintageId */
export interface ReviewsView {
  /** The site-wide lookup, shared by everyone. */
  shared:
    | { status: "pending"; startedAt: string }
    | { status: "done"; review: ProReview; fetchedAt: string; canRefresh: boolean }
    | { status: "failed"; at: string; canRetry: boolean }
    | null;
  /** What I pasted back from my own AI: only I see it, it is not checked. */
  mine: { review: ProReview; importedAt: string } | null;
  /** New lookups I may still start today; cached ones are free. */
  left: number;
  /** false when the site cannot look anything up (no AI key, or this month's budget is spent). */
  available: boolean;
}

export const MAX_CRITICS = 24;
const SCORE_RE = /^\d{1,3}(?:\.\d)?\+?(?:-\d{1,3}(?:\.\d)?\+?)?(?:\/(?:20|100))?$/;

/** "97 – 99 pts" → "97-99"; null when it is not a score. */
export function cleanScore(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw)
    .replace(/[–—~]/g, "-")
    .replace(/\s*(?:points?|pts?\.?|分)\s*$/i, "")
    .replace(/\s+/g, "");
  return SCORE_RE.test(s) ? s : null;
}

/** The numbers a score is made of: "97-99" → ["97", "99"]. */
export const scoreNumbers = (score: string) => score.replace(/\/(?:20|100)$/, "").match(/\d{1,3}(?:\.\d)?/g) ?? [];

export function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** Sites that publish their own scores: a score from anywhere else is "quoted by". */
const CRITIC_SITES = [
  "robertparker.com",
  "winespectator.com",
  "jamessuckling.com",
  "vinous.com",
  "wineenthusiast.com",
  "winemag.com",
  "jebdunnuck.com",
  "decanter.com",
  "jancisrobinson.com",
  "falstaff.com",
  "timatkin.com",
  "wineandspirits.com",
];
export const viaOf = (url: string): string | null => {
  const d = domainOf(url);
  return CRITIC_SITES.some((s) => d === s || d.endsWith(`.${s}`)) ? null : d || null;
};

/** Links to look the wine up on Wine-Searcher and CellarTracker ourselves. */
export function searchLinks(producer: string, wine: string, year: number): ProReview["links"] {
  const name = wine.toLowerCase().includes(producer.toLowerCase()) ? wine : `${producer} ${wine}`;
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ']/g, "")
    .replace(/[^a-z0-9]+/g, "+")
    .replace(/^\+|\+$/g, "");
  const y = year > 0 ? year : "";
  return {
    wineSearcher: `https://www.wine-searcher.com/find/${slug}${y ? `/${y}` : ""}`,
    cellarTracker: `https://www.cellartracker.com/list.asp?Table=List&iUserOverride=0&szSearch=${encodeURIComponent(`${name} ${y}`.trim())}`,
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9一-鿿]+/g, " ")
    .trim();
const WORDS = DESCRIPTORS.flatMap((d) => [d.name.en, d.name.zh, d.name.tw].map((w) => [norm(w), d.id] as const));

/** Reviewers' words → our vocabulary: "blackcurrant", "cassis", "黑醋栗" → "blackcurrant". */
export function aromaIds(words: unknown, max = 8): string[] {
  if (!Array.isArray(words)) return [];
  const out: string[] = [];
  for (const w of words) {
    if (typeof w !== "string") continue;
    const n = norm(w);
    if (!n) continue;
    const exact = WORDS.find(([k]) => k === n) ?? WORDS.find(([k]) => k === n.replace(/s$/, ""));
    const hit = exact ?? WORDS.find(([k]) => k.length > 3 && (n.includes(k) || k.includes(n)));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
    if (out.length >= max) break;
  }
  return out;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// ── 用自己的 AI 查 ────────────────────────────────────────────────────────────────────────────

export const IMPORT_START = "=== WINE-JOURNAL ===";
export const IMPORT_END = "=== END ===";

const FORMAT = `${IMPORT_START}
{"critics":[{"publication":"Wine Advocate","reviewer":"Lisa Perrotti-Brown","score":"97-99","url":"https://..."}],
 "community":{"avg":93.1,"count":59,"url":"https://www.cellartracker.com/..."},
 "price_usd":{"avg":461,"url":"https://www.wine-searcher.com/..."},
 "drink_window":"2027-2050",
 "aromas":["blackcurrant","cedar","violet"],
 "summary":"..."}
${IMPORT_END}`;

/** The prompt behind 用自己的 AI 查, in the page's language. */
export function reviewPrompt(lang: Lang, producer: string, wine: string, year: number): string {
  const name = wine.toLowerCase().includes(producer.toLowerCase()) ? wine : `${producer} ${wine}`;
  const v = year > 0 ? String(year) : "NV";
  if (lang === "en")
    return `Please search the web for published reviews of this wine:
${name}, vintage ${v}.

Rules:
1. Only report a critic score you actually saw on a web page for this exact wine and this exact vintage. Copy it exactly as printed (e.g. "97-99", "98+"). Never estimate or average. If you find nothing, leave the list empty.
2. One entry per reviewer: a publication (Wine Advocate, Vinous…) often has several reviewers; give the reviewer's name when shown.
3. Give the URL of the page where you saw each score.
4. Also look for the CellarTracker community average and number of notes, and the Wine-Searcher average price in US dollars, each with its link.
5. Do not copy review text. "aromas" are up to 8 single English words for aromas the reviews mention. "summary" is at most 3 sentences in your own words, in English.

First answer however you like. Then end your answer with exactly this block (valid JSON between the two lines; use null for anything not found):
${FORMAT}`;
  const tw = lang === "zh-TW";
  const z = (s: string, t: string) => (tw ? t : s);
  return `${z("请联网搜索这款葡萄酒公开发表的专业评价", "請上網搜尋這款葡萄酒公開發表的專業評價")}：
${name}，${z("年份", "年份")} ${v}。

${z("要求", "要求")}：
1. ${z(
    '只报你在网页上真的看到的、属于这款酒这个年份的评论家分数，照原样写（例如 "97-99"、"98+"）。不要估计，不要平均。找不到就留空。',
    '只報你在網頁上真的看到的、屬於這款酒這個年份的評論家分數，照原樣寫（例如 "97-99"、"98+"）。不要估計，不要平均。找不到就留空。',
  )}
2. ${z(
    "每位评论人一条：同一刊物（Wine Advocate、Vinous 等）常有不止一位评论人，有名字就写上。",
    "每位評論人一筆：同一刊物（Wine Advocate、Vinous 等）常有不只一位評論人，有名字就寫上。",
  )}
3. ${z("每个分数附上你看到它的网页链接。", "每個分數附上你看到它的網頁連結。")}
4. ${z(
    "另外找 CellarTracker 的社区均分和笔记条数，以及 Wine-Searcher 的平均价格（美元），都附链接。",
    "另外找 CellarTracker 的社群平均分和筆記數，以及 Wine-Searcher 的平均價格（美元），都附連結。",
  )}
5. ${z(
    "不要抄酒评原文。aromas 写酒评里提到的最多 8 个香气，用英文单词。summary 用你自己的话，最多 3 句，用简体中文。",
    "不要抄酒評原文。aromas 寫酒評裡提到的最多 8 個香氣，用英文單字。summary 用你自己的話，最多 3 句，用繁體中文。",
  )}

${z(
  "前面怎么回答都可以，最后请一定附上下面这段（两行标记之间是合法的 JSON，找不到的填 null）：",
  "前面怎麼回答都可以，最後請一定附上下面這段（兩行標記之間是合法的 JSON，找不到的填 null）：",
)}
${FORMAT}`;
}

/**
 * What someone pasted back from their own AI: the block between the markers (or the last JSON object
 * in the text), cleaned field by field. Nothing in it is checked against a source: it is shown as
 * "用户导入，未核实". Null when no usable block is found.
 */
export function parseImport(pasted: string, lang: Lang, links: ProReview["links"]): ProReview | null {
  let body = pasted;
  const start = pasted.lastIndexOf(IMPORT_START);
  if (start >= 0) {
    body = pasted.slice(start + IMPORT_START.length);
    const end = body.indexOf(IMPORT_END);
    if (end >= 0) body = body.slice(0, end);
  }
  body = body.replace(/```(?:json)?/g, "");
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  if (open < 0 || close <= open) return null;
  let raw: Record<string, unknown>;
  try {
    // Chat apps turn quotes curly when people copy: put them back.
    raw = JSON.parse(body.slice(open, close + 1).replace(/[“”]/g, '"'));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const critics: CriticScore[] = [];
  for (const c of Array.isArray(raw.critics) ? raw.critics : []) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const publication = text(o.publication ?? o.critic, 60);
    const score = cleanScore(o.score);
    const url = cleanUrl(o.url ?? o.source_url);
    if (!publication || !score) continue;
    critics.push({ publication, reviewer: text(o.reviewer, 60), score, url: url ?? "", via: url ? viaOf(url) : null });
    if (critics.length >= MAX_CRITICS) break;
  }
  const c = raw.community as Record<string, unknown> | null;
  const avg = c && typeof c === "object" ? num(c.avg, 50, 100) : null;
  const p = (raw.price_usd ?? raw.price) as Record<string, unknown> | null;
  const usd = p && typeof p === "object" ? num(p.avg ?? p.usd, 1, 1_000_000) : null;
  const summary = text(raw.summary, 600);
  const review: ProReview = {
    critics,
    community:
      c && avg !== null
        ? { avg, count: num(c.count, 0, 1_000_000), url: cleanUrl(c.url) ?? links.cellarTracker }
        : null,
    price: p && usd !== null ? { usd, url: cleanUrl(p.url) ?? links.wineSearcher } : null,
    drinkWindow: text(raw.drink_window ?? raw.drinkWindow, 40),
    aromas: aromaIds(raw.aromas),
    summary: summary
      ? {
          zh: lang === "zh-CN" ? summary : "",
          tw: lang === "zh-TW" ? summary : "",
          en: lang === "en" ? summary : "",
        }
      : null,
    links,
  };
  const empty = !critics.length && !review.community && !review.price && !review.summary && !review.aromas.length;
  return empty ? null : review;
}
