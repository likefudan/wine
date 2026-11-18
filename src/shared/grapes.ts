/**
 * Common grapes with their names in each language: stored in English, shown in the reader's
 * language. Taiwan uses its own names (卡本內蘇維濃, not 赤霞珠: docs/design.zh.md §3.8).
 */
export const GRAPES: { en: string; zh: string; tw: string; alt?: string[] }[] = [
  { en: "Cabernet Sauvignon", zh: "赤霞珠", tw: "卡本內蘇維濃", alt: ["cab", "cabernet", "解百纳"] },
  { en: "Merlot", zh: "梅洛", tw: "梅洛", alt: ["美乐"] },
  { en: "Pinot Noir", zh: "黑皮诺", tw: "黑皮諾" },
  { en: "Syrah", zh: "西拉", tw: "希哈", alt: ["shiraz", "设拉子"] },
  { en: "Zinfandel", zh: "仙粉黛", tw: "金芬黛", alt: ["primitivo"] },
  { en: "Cabernet Franc", zh: "品丽珠", tw: "卡本內弗朗" },
  { en: "Malbec", zh: "马尔贝克", tw: "馬爾貝克" },
  { en: "Petit Verdot", zh: "小维多", tw: "小維多" },
  { en: "Petite Sirah", zh: "小西拉", tw: "小希哈" },
  { en: "Grenache", zh: "歌海娜", tw: "格那希", alt: ["garnacha"] },
  { en: "Tempranillo", zh: "丹魄", tw: "田帕尼優" },
  { en: "Sangiovese", zh: "桑娇维塞", tw: "山吉歐維榭" },
  { en: "Nebbiolo", zh: "内比奥罗", tw: "內比歐露" },
  { en: "Mourvèdre", zh: "慕合怀特", tw: "慕維得爾", alt: ["mourvedre", "monastrell"] },
  { en: "Carménère", zh: "佳美娜", tw: "卡門內爾", alt: ["carmenere"] },
  { en: "Gamay", zh: "佳美", tw: "加美" },
  { en: "Chardonnay", zh: "霞多丽", tw: "夏多內" },
  { en: "Sauvignon Blanc", zh: "长相思", tw: "白蘇維濃" },
  { en: "Riesling", zh: "雷司令", tw: "麗絲玲" },
  { en: "Pinot Grigio", zh: "灰皮诺", tw: "灰皮諾", alt: ["pinot gris"] },
  { en: "Chenin Blanc", zh: "白诗南", tw: "白梢楠" },
  { en: "Viognier", zh: "维欧尼", tw: "維歐尼耶" },
  { en: "Gewürztraminer", zh: "琼瑶浆", tw: "格烏茲塔明那", alt: ["gewurztraminer"] },
  { en: "Muscat", zh: "麝香", tw: "蜜思嘉", alt: ["moscato", "莫斯卡托"] },
  { en: "Sémillon", zh: "赛美蓉", tw: "榭密雍", alt: ["semillon"] },
  { en: "Albariño", zh: "阿尔巴利诺", tw: "阿爾巴利諾", alt: ["albarino"] },
];

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** The English name for what was typed in any language, or the text as typed. */
export function canonicalGrape(typed: string): string {
  const k = fold(typed);
  const g = GRAPES.find(
    (g) => fold(g.en) === k || g.zh === typed.trim() || g.tw === typed.trim() || g.alt?.some((a) => fold(a) === k),
  );
  return g ? g.en : typed.trim();
}

/** A stored (English) grape name in the reader's language. */
export function grapeName(en: string, lang: "zh-CN" | "zh-TW" | "en"): string {
  if (lang === "en") return en;
  const g = GRAPES.find((g) => g.en === en);
  return g ? (lang === "zh-TW" ? g.tw : g.zh) : en;
}
