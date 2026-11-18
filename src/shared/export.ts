import { DESCRIPTOR_BY_ID, type Tri } from "./descriptors";
import { grapeName } from "./grapes";
import { COLOR_WORDS, QUALITY_WORDS, pick, tastingNote } from "./guide";
import type { Lang, ListItem, Tasting, VintageInfo, WineList } from "./model";
import { yearLabel } from "./model";

/**
 * 导出 (docs/design.zh.md §3.7): everything of mine as CSV (one row per note, for a spreadsheet) or
 * JSON (the whole copy, ids and all, for keeping or moving elsewhere). Made on the phone from its
 * own copy, so it works with no signal and includes notes not yet uploaded.
 */

export interface ExportData {
  lists: WineList[];
  items: ListItem[];
  vintages: VintageInfo[];
  tastings: Tasting[];
}

const T = (zh: string, tw: string, en: string): Tri => ({ zh, tw, en });

const DEPTH_NAMES: Record<string, Tri> = {
  quick: T("快记", "快記", "Quick"),
  beginner: T("入门", "入門", "Beginner"),
  standard: T("进阶", "進階", "Intermediate"),
  expert: T("专业", "專業", "Expert"),
};

/** The CSV columns, in order: header in each language, and the value for one note. */
type Row = { t: Tasting; v: VintageInfo | undefined; list: WineList | undefined; lang: Lang };
const COLUMNS: [Tri, (r: Row) => string | number | null | undefined][] = [
  [T("日期", "日期", "Date"), (r) => r.t.tastedAt.slice(0, 10)],
  [T("酒庄", "酒莊", "Producer"), (r) => r.v?.producer],
  [T("酒名", "酒名", "Wine"), (r) => r.v?.wine],
  [T("年份", "年份", "Vintage"), (r) => (r.v ? yearLabel(r.v.year) : null)],
  [T("类型", "類型", "Type"), (r) => (r.v ? pick(COLOR_WORDS[r.v.color], r.lang) : null)],
  [T("国家", "國家", "Country"), (r) => r.v?.country],
  [T("产区", "產區", "Region"), (r) => r.v?.region],
  [T("大区", "大產區", "Area"), (r) => r.v?.area],
  [T("子产区", "子產區", "Appellation"), (r) => r.v?.appellation],
  [T("品种", "品種", "Grapes"), (r) => r.v?.grapes.map((g) => grapeName(g, r.lang)).join(" / ")],
  [T("酒精度", "酒精濃度", "ABV"), (r) => r.v?.abv],
  [T("品鉴", "品飲", "Tasting"), (r) => r.list?.title],
  [T("深度", "深度", "Depth"), (r) => pick(DEPTH_NAMES[r.t.depth] ?? DEPTH_NAMES.quick!, r.lang)],
  [T("我的分", "我的分數", "My score"), (r) => r.t.score],
  [
    T("还会买", "還會買", "Buy again"),
    (r) => (r.t.buyAgain === null ? null : pick(r.t.buyAgain ? T("会", "會", "yes") : T("不会", "不會", "no"), r.lang)),
  ],
  [T("买了几瓶", "買了幾瓶", "Bottles bought"), (r) => r.t.boughtQty],
  [T("价格（美元）", "價格（美元）", "Price (USD)"), (r) => r.t.priceUsd],
  [
    T("品质", "品質", "Quality"),
    (r) => (r.t.quality && QUALITY_WORDS[r.t.quality] ? pick(QUALITY_WORDS[r.t.quality]!, r.lang) : null),
  ],
  [T("香气", "香氣", "Aromas"), (r) => words(r.t.descriptors.map((d) => d.id).concat(r.t.nose.custom ?? []), r.lang)],
  [T("口中风味", "口中風味", "Flavours"), (r) => words(r.t.palate.flavours ?? [], r.lang)],
  [
    T("品鉴描述", "品飲描述", "Tasting note"),
    (r) =>
      tastingNote(
        r.lang,
        r.v?.color ?? "red",
        r.t.appearance,
        r.t.nose,
        r.t.palate,
        r.t.descriptors.map((d) => d.id),
      ),
  ],
  [T("笔记", "筆記", "Notes"), (r) => r.t.note],
  [T("品酒地点", "品飲地點", "Where"), (r) => r.t.location?.name ?? r.t.location?.address],
];

/** Vocabulary words in the language; words typed by hand (专业's own words) as they are. */
function words(ids: readonly string[], lang: Lang): string {
  return ids
    .map((id) => {
      const d = DESCRIPTOR_BY_ID.get(id);
      return d ? pick(d.name, lang) : id;
    })
    .join(lang === "en" ? ", " : "、");
}

/** One CSV field: quoted when it has to be; a leading = + - @ is defused so a spreadsheet never runs it. */
function field(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The CSV: one row per note, newest first, headers in `lang`. Starts with a byte-order mark so Excel
 * reads the Chinese as UTF-8.
 */
export function toCsv(data: ExportData, lang: Lang): string {
  const vintages = new Map(data.vintages.map((v) => [v.id, v]));
  const lists = new Map(data.lists.map((l) => [l.id, l]));
  const itemList = new Map(data.items.map((i) => [i.id, i.listId]));
  const rows = [...data.tastings]
    .sort((a, b) => b.tastedAt.localeCompare(a.tastedAt))
    .map((t) => {
      const listId = t.listItemId ? itemList.get(t.listItemId) : undefined;
      const r: Row = { t, v: vintages.get(t.vintageId), list: listId ? lists.get(listId) : undefined, lang };
      return COLUMNS.map(([, f]) => field(f(r))).join(",");
    });
  const head = COLUMNS.map(([h]) => field(pick(h, lang))).join(",");
  return `﻿${[head, ...rows].join("\r\n")}\r\n`;
}

/** The JSON: the whole copy as the app keeps it, so nothing is lost. */
export function toJson(data: ExportData, exportedAt = new Date().toISOString()): string {
  return JSON.stringify(
    {
      format: "wine-journal-export",
      version: 1,
      exportedAt,
      lists: data.lists,
      items: data.items,
      vintages: data.vintages,
      tastings: data.tastings,
    },
    null,
    2,
  );
}

/** wine-journal-2026-11-18.csv */
export const exportName = (ext: "csv" | "json", now = new Date()) => {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `wine-journal-${d}.${ext}`;
};
