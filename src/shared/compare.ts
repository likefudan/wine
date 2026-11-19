import type { Tri } from "./descriptors";
import type { Lang, ListItem, Tasting } from "./model";

/**
 * 和上一款比 (docs/design.zh.md §3.4): a beginner can't say how tannic a wine is, but can say it is
 * more tannic than the last one. In a list, from the second wine on, the scale questions offer
 * “less / about the same / more than the last one”, and the tasting note says how the two differ.
 */

const T = (zh: string, tw: string, en: string): Tri => ({ zh, tw, en });

/** The scale fields that can be compared, with the words for less and more, and the scale's top. */
export const COMPARABLE = {
  "nose.intensity": { less: T("更淡", "更淡", "Fainter"), more: T("更浓", "更濃", "Stronger"), max: 5 },
  "palate.sweetness": { less: T("没那么甜", "沒那麼甜", "Less sweet"), more: T("更甜", "更甜", "Sweeter"), max: 6 },
  "palate.acidity": { less: T("没那么酸", "沒那麼酸", "Less tart"), more: T("更酸", "更酸", "More tart"), max: 5 },
  "palate.tannin": { less: T("没那么涩", "沒那麼澀", "Less drying"), more: T("更涩", "更澀", "More drying"), max: 5 },
  "palate.body": { less: T("更轻", "更輕", "Lighter"), more: T("更厚重", "更厚重", "Heavier"), max: 5 },
  "palate.alcohol": {
    less: T("没那么热", "沒那麼熱", "Less warming"),
    more: T("更热", "更熱", "More warming"),
    max: 5,
  },
  "palate.finish": { less: T("更短", "更短", "Shorter"), more: T("更长", "更長", "Longer"), max: 5 },
} as const;
export type Comparable = keyof typeof COMPARABLE;
export const isComparable = (f: string): f is Comparable => f in COMPARABLE;

/** Names for the comparison line: 「单宁更高」. */
const NAMES: Record<Comparable, Tri> = {
  "nose.intensity": T("香气", "香氣", "aromas"),
  "palate.sweetness": T("甜度", "甜度", "sweetness"),
  "palate.acidity": T("酸度", "酸度", "acidity"),
  "palate.tannin": T("单宁", "單寧", "tannin"),
  "palate.body": T("酒体", "酒體", "body"),
  "palate.alcohol": T("酒精", "酒精", "alcohol"),
  "palate.finish": T("余味", "餘韻", "finish"),
};

/** Fields where 高 / 低 reads oddly: 「余味更长」, not 「余味更高」. */
const UP_DOWN: Partial<Record<Comparable, [Tri, Tri]>> = {
  "nose.intensity": [T("更浓", "更濃", "stronger"), T("更淡", "更淡", "fainter")],
  "palate.body": [T("更饱满", "更飽滿", "fuller"), T("更轻", "更輕", "lighter")],
  "palate.finish": [T("更长", "更長", "longer"), T("更短", "更短", "shorter")],
};

export function scaleValue(t: Pick<Tasting, "nose" | "palate">, f: Comparable): number | undefined {
  const [part, key] = f.split(".") as ["nose" | "palate", string];
  const v = (t[part] as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

/** The value one step below (-1), the same as (0) or above (+1) the last wine's, kept on the scale. */
export const nudge = (f: Comparable, prev: number, dir: -1 | 0 | 1) =>
  Math.min(COMPARABLE[f].max, Math.max(1, prev + dir));

/**
 * My note on the wine before this one in the same list: the nearest earlier wine I have a note on.
 * null outside a list, or on its first wine.
 */
export function previousTasting(
  x: Pick<Tasting, "id" | "listItemId">,
  items: readonly ListItem[],
  tastings: readonly Tasting[],
): Tasting | null {
  if (!x.listItemId) return null;
  const item = items.find((i) => i.id === x.listItemId);
  if (!item) return null;
  const earlier = items
    .filter((i) => i.listId === item.listId && i.position < item.position)
    .sort((a, b) => b.position - a.position);
  for (const i of earlier) {
    const t = tastings
      .filter((s) => s.listItemId === i.id && s.id !== x.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (t) return t;
  }
  return null;
}

/**
 * 「和上一款比：单宁更高，酸度差不多，余味更长」 — only the fields both notes have. Empty when there
 * is nothing to compare.
 */
export function compareLine(lang: Lang, cur: Tasting, prev: Tasting): string {
  const w = (t: Tri) => (lang === "en" ? t.en : lang === "zh-TW" ? t.tw : t.zh);
  const parts: string[] = [];
  for (const f of Object.keys(COMPARABLE) as Comparable[]) {
    const a = scaleValue(cur, f),
      b = scaleValue(prev, f);
    if (a === undefined || b === undefined) continue;
    const name = w(NAMES[f]);
    const [up, down] = UP_DOWN[f] ?? [T("更高", "更高", "higher"), T("更低", "更低", "lower")];
    const how = a === b ? T("差不多", "差不多", "about the same") : a > b ? up : down;
    parts.push(lang === "en" ? `${name} ${how.en}` : `${name}${w(how)}`);
  }
  if (cur.score !== null && prev.score !== null && cur.score !== prev.score) {
    const d = cur.score - prev.score;
    parts.push(
      lang === "en"
        ? `${Math.abs(d)} points ${d > 0 ? "higher" : "lower"} on my score`
        : lang === "zh-TW"
          ? `我的評分${d > 0 ? "高" : "低"} ${Math.abs(d)} 分`
          : `我的评分${d > 0 ? "高" : "低"} ${Math.abs(d)} 分`,
    );
  }
  if (!parts.length) return "";
  if (lang === "en") return `Compared with the last wine: ${parts.join(", ")}`;
  return `和上一款比：${parts.join("，")}`;
}
