/**
 * Common grapes with their names in each language: stored in English, shown in the reader's
 * language. Taiwan uses its own names (卡本內蘇維濃, not 赤霞珠: docs/design.zh.md §3.8).
 */
export interface Grape {
  en: string;
  zh: string;
  tw: string;
  alt?: string[];
  /** A white grape (for which chips come first on a white wine). */
  white?: true;
}

export const GRAPES: Grape[] = [
  { en: "Cabernet Sauvignon", zh: "赤霞珠", tw: "卡本內蘇維濃", alt: ["cab", "cabernet", "解百纳"] },
  { en: "Merlot", zh: "梅洛", tw: "梅洛", alt: ["美乐"] },
  { en: "Pinot Noir", zh: "黑皮诺", tw: "黑皮諾" },
  { en: "Syrah", zh: "西拉", tw: "希哈", alt: ["shiraz", "设拉子"] },
  { en: "Zinfandel", zh: "仙粉黛", tw: "金芬黛" },
  { en: "Cabernet Franc", zh: "品丽珠", tw: "卡本內弗朗" },
  { en: "Malbec", zh: "马尔贝克", tw: "馬爾貝克" },
  { en: "Petit Verdot", zh: "小维多", tw: "小維多" },
  { en: "Petite Sirah", zh: "小西拉", tw: "小希哈" },
  { en: "Grenache", zh: "歌海娜", tw: "格那希", alt: ["garnacha", "grenache noir"] },
  { en: "Tempranillo", zh: "丹魄", tw: "田帕尼優" },
  { en: "Sangiovese", zh: "桑娇维塞", tw: "山吉歐維榭" },
  { en: "Nebbiolo", zh: "内比奥罗", tw: "內比歐露" },
  { en: "Mourvèdre", zh: "慕合怀特", tw: "慕維得爾", alt: ["mourvedre", "monastrell"] },
  { en: "Carménère", zh: "佳美娜", tw: "卡門內爾", alt: ["carmenere"] },
  { en: "Gamay", zh: "佳美", tw: "加美" },
  { en: "Chardonnay", zh: "霞多丽", tw: "夏多內", white: true },
  { en: "Sauvignon Blanc", zh: "长相思", tw: "白蘇維濃", white: true },
  { en: "Riesling", zh: "雷司令", tw: "麗絲玲", white: true },
  { en: "Pinot Grigio", zh: "灰皮诺", tw: "灰皮諾", alt: ["pinot gris"], white: true },
  { en: "Chenin Blanc", zh: "白诗南", tw: "白梢楠", white: true },
  { en: "Viognier", zh: "维欧尼", tw: "維歐尼耶", white: true },
  { en: "Gewürztraminer", zh: "琼瑶浆", tw: "格烏茲塔明那", alt: ["gewurztraminer"], white: true },
  { en: "Muscat", zh: "麝香", tw: "蜜思嘉", alt: ["moscato", "莫斯卡托"], white: true },
  { en: "Sémillon", zh: "赛美蓉", tw: "榭密雍", alt: ["semillon"], white: true },
  { en: "Albariño", zh: "阿尔巴利诺", tw: "阿爾巴利諾", alt: ["albarino"], white: true },
  { en: "Barbera", zh: "巴贝拉", tw: "巴貝拉" },
  { en: "Dolcetto", zh: "多赛托", tw: "多切托" },
  { en: "Aglianico", zh: "艾格尼科", tw: "艾格尼科" },
  { en: "Nero d'Avola", zh: "黑达沃拉", tw: "黑達沃拉", alt: ["nero davola"] },
  { en: "Montepulciano", zh: "蒙特布查诺", tw: "蒙鐵布奇亞諾" },
  { en: "Corvina", zh: "科维纳", tw: "科維納" },
  { en: "Primitivo", zh: "普里米蒂沃", tw: "普里米蒂沃" },
  { en: "Pinotage", zh: "皮诺塔吉", tw: "皮諾塔吉" },
  { en: "Tannat", zh: "丹娜", tw: "塔那" },
  { en: "Touriga Nacional", zh: "国产多瑞加", tw: "國產杜麗佳" },
  { en: "Cinsault", zh: "神索", tw: "仙梭", alt: ["cinsaut"] },
  { en: "Carignan", zh: "佳丽酿", tw: "卡利濃", alt: ["carignane", "cariñena", "carinena"] },
  { en: "Mencía", zh: "门西亚", tw: "門西亞", alt: ["mencia"] },
  { en: "Blaufränkisch", zh: "蓝佛朗克", tw: "藍佛朗克", alt: ["blaufrankisch", "lemberger"] },
  { en: "Pinot Meunier", zh: "莫尼耶皮诺", tw: "皮諾莫尼耶", alt: ["meunier"] },
  { en: "Marselan", zh: "马瑟兰", tw: "馬瑟蘭" },
  { en: "Cabernet Gernischt", zh: "蛇龙珠", tw: "蛇龍珠" },
  { en: "Grüner Veltliner", zh: "绿维特利纳", tw: "綠維特林納", alt: ["gruner veltliner", "gruner"], white: true },
  { en: "Pinot Blanc", zh: "白皮诺", tw: "白皮諾", alt: ["pinot bianco"], white: true },
  { en: "Marsanne", zh: "玛珊", tw: "馬珊", white: true },
  { en: "Roussanne", zh: "瑚珊", tw: "胡珊", white: true },
  { en: "Grenache Blanc", zh: "白歌海娜", tw: "白格那希", alt: ["garnacha blanca"], white: true },
  { en: "Torrontés", zh: "特浓情", tw: "多隆帝斯", alt: ["torrontes"], white: true },
  { en: "Vermentino", zh: "维蒙蒂诺", tw: "維門替諾", white: true },
  { en: "Verdejo", zh: "弗德乔", tw: "弗德荷", white: true },
  { en: "Garganega", zh: "卡尔卡耐卡", tw: "卡爾卡耐卡", white: true },
  { en: "Trebbiano", zh: "特雷比奥罗", tw: "崔比亞諾", alt: ["ugni blanc"], white: true },
  { en: "Glera", zh: "格雷拉", tw: "格雷拉", alt: ["prosecco"], white: true },
  { en: "Fiano", zh: "菲亚诺", tw: "菲亞諾", white: true },
  { en: "Furmint", zh: "富尔民特", tw: "弗明", white: true },
  { en: "Assyrtiko", zh: "阿斯提可", tw: "阿希爾提可", white: true },
  { en: "Melon de Bourgogne", zh: "勃艮第香瓜", tw: "布根地香瓜", alt: ["muscadet", "melon"], white: true },
  { en: "Sylvaner", zh: "西万尼", tw: "希爾瓦那", alt: ["silvaner"], white: true },
  { en: "Petit Manseng", zh: "小芒森", tw: "小蒙仙", white: true },
  { en: "Palomino", zh: "帕洛米诺", tw: "帕洛米諾", white: true },
  { en: "Pedro Ximénez", zh: "佩德罗-希梅内斯", tw: "佩德羅希梅內斯", alt: ["pedro ximenez", "px"], white: true },
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

/** The grapes worth one tap for a wine of this colour, most-drunk first; the rest go in a list. */
const COMMON: Record<string, string[]> = {
  red: ["Cabernet Sauvignon", "Merlot", "Pinot Noir", "Syrah", "Grenache", "Tempranillo", "Sangiovese", "Malbec"],
  white: [
    "Chardonnay",
    "Sauvignon Blanc",
    "Riesling",
    "Pinot Grigio",
    "Chenin Blanc",
    "Muscat",
    "Gewürztraminer",
    "Viognier",
  ],
  sparkling: ["Chardonnay", "Pinot Noir", "Pinot Meunier", "Glera", "Muscat", "Riesling"],
  rose: ["Grenache", "Syrah", "Cinsault", "Pinot Noir", "Mourvèdre", "Tempranillo", "Sangiovese", "Zinfandel"],
  dessert: ["Sémillon", "Riesling", "Muscat", "Chenin Blanc", "Furmint", "Pedro Ximénez", "Touriga Nacional"],
  any: ["Cabernet Sauvignon", "Merlot", "Pinot Noir", "Syrah", "Chardonnay", "Sauvignon Blanc", "Riesling", "Grenache"],
};
export const commonGrapes = (color?: string | null): string[] => COMMON[color ?? "any"] ?? COMMON.any!;
