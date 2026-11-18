import { DESCRIPTORS } from "./descriptors";
import type { Lang } from "./model";

/**
 * 自由文字转香气标签 (docs/design.zh.md §3.3): finds the vocabulary's words in a note typed or
 * dictated in any of the three languages — 「很多黑樱桃和雪茄盒」 → black-cherry, cigar-box — so the
 * page can offer them as tags to confirm. Runs on the phone, no AI, so it works with no signal.
 *
 * Longest words first, and a word found takes its letters, so 黑醋栗 is not also 醋栗 and 杏仁 not 杏.
 * A word right after 不 / 没有 / no / without is skipped: 「没有橡木味」 adds nothing.
 */

/** Everyday names the vocabulary itself doesn't use. Lower case. */
const ALIASES: Record<string, string[]> = {
  "red-cherry": ["樱桃", "櫻桃", "cherry", "cherries"],
  "black-cherry": ["车厘子", "車厘子", "black cherries"],
  blackcurrant: ["黑加仑", "黑加侖", "cassis", "black currant", "blackcurrants"],
  "red-plum": ["李子", "梅子", "plum", "plums"],
  "black-plum": ["黑梅", "black plums"],
  prune: ["西梅干", "黑枣", "prunes"],
  "black-pepper": ["胡椒", "pepper", "peppery"],
  "green-pepper": ["甜椒", "bell pepper", "capsicum"],
  "green-apple": ["苹果", "蘋果", "apple", "apples"],
  "orange-peel": ["橙子", "橘子皮", "陈皮", "陳皮", "orange zest"],
  grapefruit: ["柚子"],
  lime: ["青檸"],
  toast: ["吐司", "烘烤", "烤面包片", "toasty", "toasted"],
  "cigar-box": ["雪茄", "cigar"],
  smoke: ["烟熏味", "烟熏的", "煙燻", "smoky", "smokey"],
  chocolate: ["可可", "cocoa", "dark chocolate"],
  coffee: ["摩卡", "咖啡豆", "espresso", "mocha"],
  earth: ["土壤", "泥土味", "earthy", "soil"],
  mushroom: ["菌菇", "松露", "truffle", "mushrooms"],
  "forest-floor": ["落叶", "落葉", "undergrowth", "sous bois"],
  leather: ["leathery"],
  "wet-stone": ["石头", "石頭", "stony", "wet stone"],
  flint: ["火柴", "火石", "燧石", "flinty", "struck match"],
  petrol: ["煤油", "汽油味", "kerosene", "gasoline"],
  graphite: ["铅笔", "鉛筆", "pencil lead", "pencil shavings"],
  grass: ["青草味", "grassy", "freshly cut grass"],
  mint: ["minty"],
  vanilla: ["香草味"],
  honey: ["honeyed"],
  saline: ["海盐", "海鹽", "salty", "sea salt"],
  "white-flowers": ["茉莉", "jasmine"],
  rose: ["roses"],
  violet: ["violets"],
  strawberry: ["strawberries"],
  raspberry: ["raspberries"],
  blackberry: ["blackberries"],
  blueberry: ["blueberries"],
  lemon: ["lemony"],
  butter: ["buttery"],
  jam: ["jammy"],
  licorice: ["liquorice", "anise"],
  biscuit: ["曲奇"],
};

/** The same word in two languages for two things: which one each language means. */
const CLASH: Record<string, Partial<Record<Lang, string>>> = {
  奶油: { "zh-CN": "cream", "zh-TW": "butter", en: "cream" },
};

type Term = { term: string; id: string; latin: boolean };
const cache = new Map<Lang, Term[]>();

function terms(lang: Lang): Term[] {
  const hit = cache.get(lang);
  if (hit) return hit;
  const seen = new Map<string, string>();
  const add = (term: string, id: string) => {
    const k = term.trim().toLowerCase();
    if (k.length < 1 || seen.has(k)) return;
    seen.set(k, CLASH[k]?.[lang] ?? id);
  };
  for (const d of DESCRIPTORS) {
    add(d.name.zh, d.id);
    add(d.name.tw, d.id);
    add(d.name.en, d.id);
  }
  for (const [id, words] of Object.entries(ALIASES)) for (const w of words) add(w, id);
  const list = [...seen].map(([term, id]) => ({ term, id, latin: /^[\x20-\x7e]+$/.test(term) }));
  list.sort((a, b) => b.term.length - a.term.length);
  cache.set(lang, list);
  return list;
}

const NEG_ZH = /(?:不|没|沒|无|無|没有|沒有|不是)[^，,。.；;！!？?\s]{0,1}$/;
const NEG_EN = /\b(?:no|not|without|never|lacks?|lacking)\s+(?:\w+\s+)?$/;

/** The vocabulary ids a note mentions, in the order they appear. */
export function aromasInNote(text: string | null | undefined, lang: Lang): string[] {
  if (!text) return [];
  const s = text.toLowerCase();
  const taken = new Uint8Array(s.length);
  const found: { id: string; at: number }[] = [];
  for (const { term, id, latin } of terms(lang)) {
    let from = 0;
    for (;;) {
      const at = s.indexOf(term, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + term.length;
      if (latin && (/[a-z0-9]/.test(s[at - 1] ?? "") || /[a-z0-9]/.test(s[end] ?? ""))) continue;
      if (taken.subarray(at, end).some((x) => x)) continue;
      taken.fill(1, at, end);
      const before = s.slice(Math.max(0, at - 16), at);
      if (latin ? NEG_EN.test(before) : NEG_ZH.test(before)) continue;
      found.push({ id, at });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return [...new Set(found.map((f) => f.id))];
}
