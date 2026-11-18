import { DESCRIPTOR_BY_ID, type Tri } from "./descriptors";
import { type Appearance, HUES, type Lang, type Nose, type Palate, type WineColor, hueFamily } from "./model";

/**
 * 入门's questions, the words for every scale, and the step that turns answers into a tasting note
 * (docs/design.zh.md §3.4). The beginner questions are written for each language, not translated:
 * the everyday comparisons have to be ones that reader knows (§3.8). Shipped with the code so they
 * work with no signal.
 */

const T = (zh: string, tw: string, en: string): Tri => ({ zh, tw, en });
export const pick = (t: Tri, lang: Lang) => (lang === "en" ? t.en : lang === "zh-TW" ? t.tw : t.zh);

// ── Scale words ──────────────────────────────────────────────────────────────────────────────

/** low, medium-, medium, medium+, high */
export const LEVEL_WORDS: Tri[] = [
  T("低", "低", "low"),
  T("中低", "中低", "medium-"),
  T("中", "中", "medium"),
  T("中高", "中高", "medium+"),
  T("高", "高", "high"),
];
export const BODY_WORDS: Tri[] = [
  T("轻盈", "輕盈", "light"),
  T("偏轻", "偏輕", "medium-"),
  T("中等", "中等", "medium"),
  T("偏饱满", "偏飽滿", "medium+"),
  T("饱满", "飽滿", "full"),
];
export const FINISH_WORDS: Tri[] = [
  T("短", "短", "short"),
  T("中短", "中短", "medium-"),
  T("中等", "中等", "medium"),
  T("中长", "中長", "medium+"),
  T("长", "長", "long"),
];
export const SWEETNESS_WORDS: Tri[] = [
  T("干", "不甜", "dry"),
  T("微甜", "微甜", "off-dry"),
  T("半干", "半甜偏干", "medium-dry"),
  T("半甜", "半甜", "medium-sweet"),
  T("甜", "甜", "sweet"),
  T("极甜", "極甜", "luscious"),
];
export const DEPTH_WORDS: Tri[] = [T("浅", "淺", "pale"), T("中等", "中等", "medium"), T("深", "深", "deep")];
export const HUE_WORDS: Record<string, Tri> = {
  purple: T("紫红", "紫紅", "purple"),
  ruby: T("宝石红", "寶石紅", "ruby"),
  garnet: T("石榴红", "石榴紅", "garnet"),
  tawny: T("茶褐", "茶褐", "tawny"),
  "lemon-green": T("柠檬绿", "檸檬綠", "lemon-green"),
  lemon: T("柠檬黄", "檸檬黃", "lemon"),
  gold: T("金黄", "金黃", "gold"),
  amber: T("琥珀", "琥珀", "amber"),
  brown: T("棕褐", "棕褐", "brown"),
  pink: T("粉红", "粉紅", "pink"),
  salmon: T("三文鱼色", "鮭魚色", "salmon"),
  orange: T("橙红", "橙紅", "orange"),
};
export const QUALITY_WORDS: Record<string, Tri> = {
  faulty: T("有缺陷", "有缺陷", "faulty"),
  poor: T("差", "差", "poor"),
  acceptable: T("尚可", "尚可", "acceptable"),
  good: T("好", "好", "good"),
  "very-good": T("很好", "很好", "very good"),
  outstanding: T("杰出", "傑出", "outstanding"),
};
export const DEVELOPMENT_WORDS: Record<string, Tri> = {
  youthful: T("年轻", "年輕", "youthful"),
  developing: T("发展中", "發展中", "developing"),
  developed: T("成熟", "成熟", "fully developed"),
  tired: T("已过巅峰", "已過巔峰", "tired"),
};
export const READINESS_WORDS: Record<string, Tri> = {
  "too-young": T("太年轻", "太年輕", "too young"),
  "can-age": T("现在能喝，也能再陈", "現在能喝，也能再陳", "can drink now, has potential for ageing"),
  "drink-now": T("现在喝，不宜再陈", "現在喝，不宜再陳", "drink now: not suitable for ageing"),
  "too-old": T("太老了", "太老了", "too old"),
};
export const TEXTURE_WORDS: Record<string, Tri> = {
  fine: T("细腻", "細緻", "fine-grained"),
  grainy: T("颗粒感", "顆粒感", "grainy"),
  coarse: T("粗糙", "粗糙", "coarse"),
  green: T("青涩", "青澀", "green"),
};
export const MOUSSE_WORDS: Record<string, Tri> = {
  delicate: T("细腻", "細緻", "delicate"),
  creamy: T("绵密", "綿密", "creamy"),
  aggressive: T("粗大", "粗大", "aggressive"),
};
export const FAULT_WORDS: Record<string, Tri> = {
  cork: T("木塞味", "木塞味", "cork taint"),
  oxidised: T("氧化", "氧化", "oxidised"),
  reduced: T("还原味", "還原味", "reduced"),
  brett: T("酒香酵母", "酒香酵母", "Brett"),
  va: T("挥发酸", "揮發酸", "volatile acidity"),
};
export const REASON_WORDS: Record<string, Tri> = {
  balance: T("平衡", "平衡", "balance"),
  length: T("长度", "長度", "length"),
  intensity: T("强度", "強度", "intensity"),
  complexity: T("复杂度", "複雜度", "complexity"),
};
export const COLOR_WORDS: Record<WineColor, Tri> = {
  red: T("红", "紅", "Red"),
  white: T("白", "白", "White"),
  rose: T("桃红", "粉紅", "Rosé"),
  sparkling: T("起泡", "氣泡", "Sparkling"),
  dessert: T("甜酒", "甜酒", "Dessert"),
};

// ── 杯中色 ───────────────────────────────────────────────────────────────────────────────────

/** The core colour of a glass seen from above, by hue and depth (pale, medium, deep). */
const GLASS: Record<string, [string, string, string]> = {
  purple: ["#8a2f5c", "#6b1d48", "#4a0f33"],
  ruby: ["#a4243b", "#7d1530", "#560c22"],
  garnet: ["#9a3a2e", "#7a2a22", "#561b16"],
  tawny: ["#b0643a", "#93502c", "#6e3a1f"],
  "lemon-green": ["#ece9a8", "#e0dc84", "#d2cc62"],
  lemon: ["#f1e3a0", "#e8d27a", "#dcbf55"],
  gold: ["#e9c86c", "#dcb04a", "#c9952f"],
  amber: ["#d99a45", "#c47f2e", "#a6631d"],
  brown: ["#8f5a33", "#734424", "#523017"],
  pink: ["#f2b5bd", "#e8919e", "#d96f80"],
  salmon: ["#f3b49a", "#ea9878", "#dc7d5c"],
  orange: ["#eea06a", "#e2854a", "#cc6a32"],
};
const DEFAULT_HUE: Record<WineColor, string> = {
  red: "ruby",
  white: "lemon",
  rose: "salmon",
  sparkling: "lemon",
  dessert: "gold",
};

/**
 * 杯中色 for a wine: from the 外观 step when recorded, otherwise a default by colour and age, so a
 * 快记 still gets a glass (§3.3).
 */
export function glassColor(color: WineColor, appearance?: Appearance, year?: number): string {
  let hue = appearance?.hue;
  if (!hue || !GLASS[hue]) {
    hue = DEFAULT_HUE[color];
    const age = year ? new Date().getFullYear() - year : 0;
    if (color === "red" && year) hue = age <= 2 ? "purple" : age >= 12 ? "garnet" : "ruby";
    if (color === "white" && year && age >= 8) hue = "gold";
  }
  const depth = appearance?.intensity ?? 2;
  return GLASS[hue]![depth - 1]!;
}

/** The hues offered for this wine, in the order they get older. */
export const huesFor = (color: WineColor, hue?: string) => HUES[hueFamily(color, hue)];

export const swatch = (hue: string, depth: 1 | 2 | 3 = 2) => GLASS[hue]?.[depth - 1] ?? "#888";

// ── 入门 questions ───────────────────────────────────────────────────────────────────────────

export type GuideField =
  | "appearance"
  | "nose.intensity"
  | "aromas"
  | "palate.sweetness"
  | "palate.acidity"
  | "palate.tannin"
  | "palate.mousse"
  | "palate.body"
  | "palate.alcohol"
  | "palate.finish";

export interface GuideOption {
  label: Tri;
  /** The value written into the field: the same scale 进阶 uses. */
  value: number | string;
}

export interface GuideQuestion {
  field: GuideField;
  ask: Tri;
  /** How to look / smell / taste for it: one line, plain words. */
  how: Tri;
  /** 为什么问这个: the only place the term appears. */
  why: Tri;
  options: GuideOption[];
}

const APPEARANCE_Q: GuideQuestion = {
  field: "appearance",
  ask: T("杯里的酒最像哪个颜色？", "杯裡的酒最像哪個顏色？", "Which colour is closest to your glass?"),
  how: T(
    "把杯子斜放在白纸或白餐巾前，看中间和杯沿。",
    "把杯子斜放在白紙或白餐巾前，看中間和杯緣。",
    "Tilt the glass over a white napkin and look at the middle and the rim.",
  ),
  why: T(
    "颜色会透露酒的年龄：红酒越老越偏砖红，白酒越老越偏金黄。专业上这一步叫「外观」。",
    "顏色會透露酒的年齡：紅酒越老越偏磚紅，白酒越老越偏金黃。專業上這一步叫「外觀」。",
    "Colour hints at age: reds turn brick-red and whites turn golden as they get older. Tasters call this step appearance.",
  ),
  options: [],
};

const NOSE_Q: GuideQuestion = {
  field: "nose.intensity",
  ask: T("闻起来香味有多浓？", "聞起來香味有多濃？", "How strong is the smell?"),
  how: T(
    "先不摇杯闻一下，再轻轻摇几圈，鼻子伸进杯口再闻。",
    "先不搖杯聞一下，再輕輕搖幾圈，鼻子伸進杯口再聞。",
    "Sniff once without swirling, then swirl a few times and put your nose right in the glass.",
  ),
  why: T(
    "香味浓淡是判断一款酒风格的第一步，专业上叫「香气强度」。",
    "香味濃淡是判斷一款酒風格的第一步，專業上叫「香氣強度」。",
    "How loud the smell is comes first when describing a wine's style. Tasters call it aroma intensity.",
  ),
  options: [
    { label: T("要很用力才闻得到", "要很用力才聞得到", "I have to search for it"), value: 2 },
    { label: T("正常，一闻就有", "正常，一聞就有", "Easy to smell"), value: 3 },
    { label: T("扑鼻而来", "撲鼻而來", "Jumps out of the glass"), value: 5 },
  ],
};

const AROMA_Q: GuideQuestion = {
  field: "aromas",
  ask: T("闻起来更像什么？", "聞起來更像什麼？", "What does it smell like?"),
  how: T(
    "不用找准，先选一个大方向，再往下挑。可以选好几个。",
    "不用找準，先選一個大方向，再往下挑。可以選好幾個。",
    "No need to be exact. Pick a direction first, then narrow it down. You can pick several.",
  ),
  why: T(
    "这些就是品酒词里的「香气」。果香来自葡萄本身，奶油和烘焙味来自酿造，皮革和蘑菇来自陈年。",
    "這些就是品酒詞裡的「香氣」。果香來自葡萄本身，奶油和烘焙味來自釀造，皮革和蘑菇來自陳年。",
    "These are the wine's aromas. Fruit comes from the grape, butter and bread from winemaking, leather and mushroom from age.",
  ),
  options: [],
};

const SWEET_Q: GuideQuestion = {
  field: "palate.sweetness",
  ask: T("喝一口，甜吗？", "喝一口，甜嗎？", "Take a sip. Is it sweet?"),
  how: T(
    "注意舌尖。果香很浓不等于甜，想想无糖果茶。",
    "注意舌尖。果香很濃不等於甜，想想無糖水果茶。",
    "Focus on the tip of your tongue. Fruity is not the same as sweet: think of unsweetened fruit tea.",
  ),
  why: T(
    "甜度来自酒里没发酵完的糖。大多数红酒是「干」的，也就是不甜。",
    "甜度來自酒裡沒發酵完的糖。大多數紅酒是「不甜」的。",
    "Sweetness is sugar the yeast didn't turn into alcohol. Most reds are dry, which just means not sweet.",
  ),
  options: [
    { label: T("完全不甜，像无糖茶", "完全不甜，像無糖茶", "Not at all, like unsweetened tea"), value: 1 },
    { label: T("有一点点甜", "有一點點甜", "A touch sweet"), value: 2 },
    { label: T("明显甜，像果汁", "明顯甜，像果汁", "Clearly sweet, like juice"), value: 4 },
    { label: T("很甜，像蜂蜜", "很甜，像蜂蜜", "Very sweet, like honey"), value: 6 },
  ],
};

const ACID_Q: GuideQuestion = {
  field: "palate.acidity",
  ask: T("咽下后，嘴里会流口水吗？", "嚥下後，嘴裡會流口水嗎？", "After you swallow, does your mouth water?"),
  how: T(
    "咽下后张开嘴，低头等几秒，感受舌头两侧。",
    "嚥下後張開嘴，低頭等幾秒，感受舌頭兩側。",
    "Swallow, open your mouth, tip your head down and wait a few seconds. Feel the sides of your tongue.",
  ),
  why: T(
    "流口水是「酸度」在起作用。酸度让酒清爽、配餐好，也让白酒能陈年。",
    "流口水是「酸度」在起作用。酸度讓酒清爽、好搭餐，也讓白酒能陳年。",
    "That watering is acidity. It makes wine refreshing and good with food, and helps whites age.",
  ),
  options: [
    { label: T("几乎不流", "幾乎不流", "Hardly"), value: 2 },
    { label: T("流一点", "流一點", "A little"), value: 3 },
    { label: T("流很多，像喝了柠檬水", "流很多，像喝了檸檬水", "A lot, like after lemonade"), value: 5 },
  ],
};

const TANNIN_Q: GuideQuestion = {
  field: "palate.tannin",
  ask: T("牙龈和舌头发干、发涩吗？", "牙齦和舌頭發乾、發澀嗎？", "Do your gums and tongue feel dry and grippy?"),
  how: T(
    "用舌头舔一下上排牙龈，看是不是像喝了浓茶后那样发干。",
    "用舌頭舔一下上排牙齦，看是不是像喝了濃茶後那樣發乾。",
    "Run your tongue over your top gums. Do they feel like after strong black tea?",
  ),
  why: T(
    "发干来自葡萄皮里的「单宁」。它让红酒能配牛排，也让酒能陈年。",
    "發乾來自葡萄皮裡的「單寧」。它讓紅酒能搭牛排，也讓酒能陳年。",
    "That drying feel is tannin, from the grape skins. It's why red wine works with steak, and why it can age.",
  ),
  options: [
    { label: T("不干，很顺滑", "不乾，很順滑", "No, smooth"), value: 1 },
    { label: T("有点干，像淡茶", "有點乾，像淡茶", "A bit, like weak tea"), value: 3 },
    {
      label: T(
        "很干，像咬了一口没熟的柿子",
        "很乾，像咬了一口沒熟的柿子",
        "Very, like strong stewed tea or walnut skins",
      ),
      value: 5,
    },
  ],
};

const MOUSSE_Q: GuideQuestion = {
  field: "palate.mousse",
  ask: T("气泡在嘴里是什么感觉？", "氣泡在嘴裡是什麼感覺？", "How do the bubbles feel?"),
  how: T(
    "含一口，让气泡在舌头上散开。",
    "含一口，讓氣泡在舌頭上散開。",
    "Hold a sip and let the bubbles spread over your tongue.",
  ),
  why: T(
    "气泡越细越绵密，通常在酒泥上待得越久，专业上叫「气泡质感」。",
    "氣泡越細越綿密，通常在酒渣上待得越久，專業上叫「氣泡質感」。",
    "Finer, creamier bubbles usually mean longer ageing on the yeast. Tasters call this the mousse.",
  ),
  options: [
    { label: T("粗大扎嘴，像汽水", "粗大刺嘴，像汽水", "Big and prickly, like soda"), value: "aggressive" },
    { label: T("细细的", "細細的", "Fine"), value: "delicate" },
    { label: T("绵密，像奶泡", "綿密，像奶泡", "Creamy, like milk foam"), value: "creamy" },
  ],
};

const BODY_Q: GuideQuestion = {
  field: "palate.body",
  ask: T(
    "在嘴里的分量感，更像脱脂奶、全脂奶，还是奶油？",
    "在嘴裡的份量感，更像脫脂奶、全脂奶，還是鮮奶油？",
    "In your mouth, does it feel more like skim milk, whole milk or cream?",
  ),
  how: T(
    "含一口在嘴里转一转，感受它的轻重。",
    "含一口在嘴裡轉一轉，感受它的輕重。",
    "Roll a sip around and feel how heavy it is.",
  ),
  why: T(
    "这种轻重感叫「酒体」，主要来自酒精和糖。",
    "這種輕重感叫「酒體」，主要來自酒精和糖。",
    "That weight is called body. It comes mostly from alcohol and sugar.",
  ),
  options: [
    { label: T("脱脂奶，轻盈", "脫脂奶，輕盈", "Skim milk, light"), value: 1 },
    { label: T("全脂奶", "全脂奶", "Whole milk"), value: 3 },
    { label: T("奶油，很厚重", "鮮奶油，很厚重", "Cream, heavy"), value: 5 },
  ],
};

const ALCOHOL_Q: GuideQuestion = {
  field: "palate.alcohol",
  ask: T("喉咙和胸口有发热的感觉吗？", "喉嚨和胸口有發熱的感覺嗎？", "Do you feel warmth in your throat and chest?"),
  how: T("咽下后注意喉咙。", "嚥下後注意喉嚨。", "Pay attention to your throat after you swallow."),
  why: T(
    "发热来自「酒精」。酒精高的酒通常来自阳光充足的产区，比如纳帕。",
    "發熱來自「酒精」。酒精高的酒通常來自陽光充足的產區，例如納帕。",
    "That warmth is alcohol. Higher-alcohol wines usually come from sunny places, like Napa.",
  ),
  options: [
    { label: T("不热", "不熱", "No"), value: 2 },
    { label: T("有一点暖", "有一點暖", "A gentle warmth"), value: 3 },
    { label: T("明显发热", "明顯發熱", "Clearly hot"), value: 5 },
  ],
};

const FINISH_Q: GuideQuestion = {
  field: "palate.finish",
  ask: T(
    "咽下后，味道在嘴里留了多久？",
    "嚥下後，味道在嘴裡留了多久？",
    "After you swallow, how long does the taste stay?",
  ),
  how: T(
    "咽下后开始默数，数到味道消失。",
    "嚥下後開始默數，數到味道消失。",
    "Start counting when you swallow, stop when the flavour fades.",
  ),
  why: T(
    "这叫「余味」。余味长是好酒最可靠的标志之一。",
    "這叫「餘韻」。餘韻長是好酒最可靠的標誌之一。",
    "That's the finish. A long finish is one of the surest signs of a good wine.",
  ),
  options: [
    { label: T("几乎马上消失", "幾乎馬上消失", "Gone almost at once"), value: 1 },
    { label: T("几秒钟", "幾秒鐘", "A few seconds"), value: 3 },
    { label: T("很久，十几秒以上", "很久，十幾秒以上", "A long time, 10+ seconds"), value: 5 },
  ],
};

/** The questions for a colour of wine, in tasting order. */
export function beginnerQuestions(color: WineColor): GuideQuestion[] {
  const qs = [APPEARANCE_Q, NOSE_Q, AROMA_Q, SWEET_Q, ACID_Q];
  if (color === "red") qs.push(TANNIN_Q);
  if (color === "sparkling") qs.push(MOUSSE_Q);
  qs.push(BODY_Q);
  if (color === "red" || color === "dessert") qs.push(ALCOHOL_Q);
  qs.push(FINISH_Q);
  return qs;
}

// ── Answers → tasting note ───────────────────────────────────────────────────────────────────

const join = (parts: string[], lang: Lang) => parts.join(lang === "en" ? ", " : "，");

/**
 * 「你刚才描述的是：深宝石红，黑色水果和雪松香气，高单宁，中高酸度，余味长」: the note a taster
 * would write for these answers. Empty when nothing is filled in.
 */
export function tastingNote(
  lang: Lang,
  color: WineColor,
  appearance: Appearance,
  nose: Nose,
  palate: Palate,
  descriptorIds: readonly string[],
): string {
  const parts: string[] = [];
  const w = (t: Tri) => pick(t, lang);
  if (appearance.hue) {
    const depth = appearance.intensity ? w(DEPTH_WORDS[appearance.intensity - 1]!) : "";
    const hue = HUE_WORDS[appearance.hue] ? w(HUE_WORDS[appearance.hue]!) : appearance.hue;
    parts.push(lang === "en" ? `${depth ? `${depth} ` : ""}${hue}` : `${depth === "中等" ? "" : depth}${hue}`);
  }
  const listOf = (ids: readonly string[]) => {
    const names = ids
      .map((id) => DESCRIPTOR_BY_ID.get(id))
      .filter((d) => !!d)
      .slice(0, 5)
      .map((d) => w(d!.name));
    if (!names.length) return "";
    return lang === "en"
      ? names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
        : names[0]!
      : names.length > 1
        ? `${names.slice(0, -1).join("、")}和${names[names.length - 1]}`
        : names[0]!;
  };
  const listed = listOf(descriptorIds);
  if (listed) {
    const strong = nose.intensity && nose.intensity >= 4;
    parts.push(
      lang === "en"
        ? `${strong ? "pronounced " : ""}aromas of ${listed.toLowerCase()}`
        : lang === "zh-TW"
          ? `${strong ? "濃郁的" : ""}${listed}香氣`
          : `${strong ? "浓郁的" : ""}${listed}香气`,
    );
  } else if (nose.intensity) {
    parts.push(
      lang === "en"
        ? `${w(LEVEL_WORDS[nose.intensity - 1]!)} intensity nose`
        : `${lang === "zh-TW" ? "香氣強度" : "香气强度"}${w(LEVEL_WORDS[nose.intensity - 1]!)}`,
    );
  }
  const level = (v: number | undefined, zh: string, tw: string, en: string) => {
    if (!v) return;
    const word = w(LEVEL_WORDS[v - 1]!);
    parts.push(lang === "en" ? `${word} ${en}` : `${word}${lang === "zh-TW" ? tw : zh}`);
  };
  if (palate.sweetness && (palate.sweetness > 1 || color !== "red"))
    parts.push(w(SWEETNESS_WORDS[palate.sweetness - 1]!));
  level(palate.tannin, "单宁", "單寧", "tannin");
  level(palate.acidity, "酸度", "酸度", "acidity");
  if (palate.mousse && MOUSSE_WORDS[palate.mousse])
    parts.push(
      lang === "en"
        ? `${w(MOUSSE_WORDS[palate.mousse]!)} mousse`
        : `${lang === "zh-TW" ? "氣泡" : "气泡"}${w(MOUSSE_WORDS[palate.mousse]!)}`,
    );
  if (palate.body)
    parts.push(
      lang === "en"
        ? `${w(BODY_WORDS[palate.body - 1]!)} body`
        : `${lang === "zh-TW" ? "酒體" : "酒体"}${w(BODY_WORDS[palate.body - 1]!)}`,
    );
  level(palate.alcohol, "酒精", "酒精", "alcohol");
  const flavours = listOf(palate.flavours ?? []);
  if (flavours) parts.push(lang === "en" ? `flavours of ${flavours.toLowerCase()}` : `口中有${flavours}`);
  if (palate.finish)
    parts.push(
      lang === "en"
        ? `${w(FINISH_WORDS[palate.finish - 1]!)} finish`
        : `${lang === "zh-TW" ? "餘韻" : "余味"}${w(FINISH_WORDS[palate.finish - 1]!)}`,
    );
  const s = join(parts, lang);
  return lang === "en" && s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
