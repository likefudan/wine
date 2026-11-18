import type { Tri } from "./descriptors";
import type { WineColor } from "./model";

/**
 * 进阶一款 (docs/design.zh.md §11): one step away from what I already like, to learn something new.
 * Each entry starts from grapes I score well and points to a grape I have not tried yet, the places
 * that make its classic version (LWIN appellation names, as LWIN spells them: no accents), and a few
 * plain sentences on what will feel familiar, what will be new and what to look for in the glass.
 * Written for beginners: no jargon a 入门 user would not know.
 */
export interface Stretch {
  id: string;
  /** Liked grapes (English, as stored) this is a step from. Empty: a starting point for anyone. */
  from: string[];
  grape: string;
  color: WineColor;
  /** LWIN appellations (or `region:<LWIN region>`) where the classic version comes from, most typical first. */
  places: string[];
  /** What it is like next to what I know, and what to notice. */
  text: Tri;
}

const T = (zh: string, tw: string, en: string): Tri => ({ zh, tw, en });

export const STRETCHES: Stretch[] = [
  {
    id: "cab-franc",
    from: ["Cabernet Sauvignon", "Merlot"],
    grape: "Cabernet Franc",
    color: "red",
    places: ["Chinon", "Saumur-Champigny", "Bourgueil"],
    text: T(
      "赤霞珠的“父亲”之一。比赤霞珠轻、单宁更细，多了红色水果、青椒和一点铅笔芯的味道。喝的时候留意：那股青青的植物香你喜不喜欢。",
      "卡本內蘇維濃的「父親」之一。比卡本內蘇維濃輕、單寧更細，多了紅色水果、青椒和一點鉛筆芯的味道。喝的時候留意：那股青青的植物香你喜不喜歡。",
      "One of Cabernet Sauvignon's parents. Lighter, with finer tannins, more red fruit, green pepper and a hint of pencil shavings. Notice whether you like that leafy, green note.",
    ),
  },
  {
    id: "malbec",
    from: ["Cabernet Sauvignon", "Merlot", "Syrah", "Zinfandel"],
    grape: "Malbec",
    color: "red",
    places: ["Lujan de Cuyo", "Uco Valley", "Cahors"],
    text: T(
      "颜色深、果味浓，像熟透的李子和黑莓，但单宁比赤霞珠圆润，入口更柔。阿根廷的版本最好入门，法国卡奥尔的更硬朗。",
      "顏色深、果味濃，像熟透的李子和黑莓，但單寧比卡本內蘇維濃圓潤，入口更柔。阿根廷的版本最好入門，法國卡奧爾的更硬朗。",
      "Deep in colour and full of ripe plum and blackberry, but rounder and softer than Cabernet. Argentina's are the easiest start; Cahors in France is firmer.",
    ),
  },
  {
    id: "gamay",
    from: ["Pinot Noir", "Grenache"],
    grape: "Gamay",
    color: "red",
    places: ["Morgon", "Fleurie", "Moulin-a-Vent"],
    text: T(
      "和黑皮诺一样清爽、红果香，但更活泼、更便宜。博若莱的“村庄级”（Morgon、Fleurie）比普通博若莱更有层次。稍微冰一下更好喝。",
      "和黑皮諾一樣清爽、紅果香，但更活潑、更便宜。薄酒萊的「村莊級」（Morgon、Fleurie）比一般薄酒萊更有層次。稍微冰一下更好喝。",
      "Fresh and red-fruited like Pinot Noir, but livelier and cheaper. The Beaujolais villages (Morgon, Fleurie) have more depth than plain Beaujolais. Serve it slightly chilled.",
    ),
  },
  {
    id: "nebbiolo",
    from: ["Pinot Noir", "Sangiovese"],
    grape: "Nebbiolo",
    color: "red",
    places: ["Langhe", "Barbaresco", "Barolo"],
    text: T(
      "看起来像黑皮诺一样浅，喝起来却很涩、很有劲，香气是玫瑰、樱桃和焦油。这是学“颜色浅不等于酒体轻”的最好一课。先从 Langhe 开始，比巴罗洛便宜也更早能喝。",
      "看起來像黑皮諾一樣淺，喝起來卻很澀、很有勁，香氣是玫瑰、櫻桃和焦油。這是學「顏色淺不等於酒體輕」的最好一課。先從 Langhe 開始，比巴羅洛便宜也更早能喝。",
      "Pale like Pinot Noir, yet grippy and powerful, smelling of roses, cherries and tar: the best lesson that a light colour doesn't mean a light wine. Start with Langhe, cheaper and readier than Barolo.",
    ),
  },
  {
    id: "grenache",
    from: ["Syrah", "Zinfandel", "Merlot"],
    grape: "Grenache",
    color: "red",
    places: ["Chateauneuf-du-Pape", "Gigondas", "Priorat"],
    text: T(
      "比西拉更甜美、更像果酱，带草莓、樱桃和一点香料，单宁柔软、酒精感偏高。教皇新堡通常是歌海娜为主的混酿。",
      "比希哈更甜美、更像果醬，帶草莓、櫻桃和一點香料，單寧柔軟、酒精感偏高。教皇新堡通常是格那希為主的混釀。",
      "Sweeter-fruited and jammier than Syrah: strawberry, cherry, a little spice, soft tannins and warm alcohol. Châteauneuf-du-Pape is usually a Grenache-led blend.",
    ),
  },
  {
    id: "syrah",
    from: ["Cabernet Sauvignon", "Malbec", "Zinfandel", "Grenache"],
    grape: "Syrah",
    color: "red",
    places: ["Saint-Joseph", "Cornas"],
    text: T(
      "法国北罗讷的西拉和澳洲的“设拉子”是同一个品种，风格却很不一样：这里更瘦、更多黑胡椒、橄榄和烟熏味。对比一下你以前喝的版本。",
      "法國北隆河的希哈和澳洲的 Shiraz 是同一個品種，風格卻很不一樣：這裡更瘦、更多黑胡椒、橄欖和煙燻味。對比一下你以前喝的版本。",
      "The same grape as Australian Shiraz, in a very different style: leaner, with black pepper, olive and smoke. Compare it with the ones you know.",
    ),
  },
  {
    id: "sangiovese",
    from: ["Merlot", "Cabernet Sauvignon", "Tempranillo"],
    grape: "Sangiovese",
    color: "red",
    places: ["Chianti Classico", "Brunello di Montalcino"],
    text: T(
      "酸度明显、带酸樱桃、番茄叶和一点泥土味，很适合配饭。如果你平时喝的酒偏圆润，这会是“高酸”最直观的体验。",
      "酸度明顯、帶酸櫻桃、番茄葉和一點泥土味，很適合配餐。如果你平時喝的酒偏圓潤，這會是「高酸」最直觀的體驗。",
      "Bright acidity, sour cherry, tomato leaf and a little earth: made for food. If you usually drink rounder wines, this is the clearest feel for “high acidity”.",
    ),
  },
  {
    id: "tempranillo",
    from: ["Cabernet Sauvignon", "Merlot", "Zinfandel"],
    grape: "Tempranillo",
    color: "red",
    places: ["region:Rioja", "Ribera del Duero"],
    text: T(
      "西班牙最重要的红葡萄。里奥哈常在美国橡木桶里陈很久，会有椰子、香草和皮革味。找一瓶标着 Reserva 的，体验一下“陈年”是什么味道。",
      "西班牙最重要的紅葡萄。里奧哈常在美國橡木桶裡陳很久，會有椰子、香草和皮革味。找一瓶標著 Reserva 的，體驗一下「陳年」是什麼味道。",
      "Spain's great red grape. Rioja often spends years in American oak, giving coconut, vanilla and leather. Try a Reserva to taste what “aged” means.",
    ),
  },
  {
    id: "mencia",
    from: ["Pinot Noir", "Tempranillo", "Cabernet Franc"],
    grape: "Mencía",
    color: "red",
    places: ["Bierzo"],
    text: T(
      "西班牙西北的小众品种，介于黑皮诺和品丽珠之间：红果、花香、一点矿物感，酒体中等。价格友好，是“发现新品种”的好例子。",
      "西班牙西北的小眾品種，介於黑皮諾和卡本內弗朗之間：紅果、花香、一點礦物感，酒體中等。價格友善，是「發現新品種」的好例子。",
      "A lesser-known grape from north-west Spain, between Pinot Noir and Cabernet Franc: red fruit, flowers, a mineral edge, medium body. Good value, and a real discovery.",
    ),
  },
  {
    id: "aglianico",
    from: ["Nebbiolo", "Cabernet Sauvignon", "Tannat"],
    grape: "Aglianico",
    color: "red",
    places: ["Taurasi"],
    text: T(
      "意大利南部的“南方巴罗洛”：颜色深、单宁和酸都高，带黑樱桃、烟熏和火山岩的感觉。适合醒酒一小时再喝。",
      "義大利南部的「南方巴羅洛」：顏色深、單寧和酸都高，帶黑櫻桃、煙燻和火山岩的感覺。適合醒酒一小時再喝。",
      "Southern Italy's “Barolo of the south”: dark, with high tannin and acidity, black cherry, smoke and a volcanic edge. Decant it for an hour.",
    ),
  },
  {
    id: "chenin",
    from: ["Chardonnay", "Riesling", "Sauvignon Blanc"],
    grape: "Chenin Blanc",
    color: "white",
    places: ["Vouvray", "Savennieres", "Saumur"],
    text: T(
      "卢瓦尔河的白诗南可以从干到甜，酸度高，带苹果、蜂蜜和一点羊毛脂的味道。买的时候看标签上的 sec（干）或 demi-sec（半干）。",
      "羅亞爾河的白梢楠可以從乾到甜，酸度高，帶蘋果、蜂蜜和一點羊毛脂的味道。買的時候看酒標上的 sec（乾）或 demi-sec（半乾）。",
      "Loire Chenin runs from dry to sweet, with high acidity, apple, honey and a waxy note. Check the label for sec (dry) or demi-sec (off-dry).",
    ),
  },
  {
    id: "gruner",
    from: ["Sauvignon Blanc", "Riesling", "Pinot Grigio"],
    grape: "Grüner Veltliner",
    color: "white",
    places: ["Wachau", "Kamptal"],
    text: T(
      "奥地利的招牌白葡萄。清爽像长相思，但多了一股白胡椒和豌豆的味道，很配中餐和日料。",
      "奧地利的招牌白葡萄。清爽像白蘇維濃，但多了一股白胡椒和豌豆的味道，很配中餐和日料。",
      "Austria's signature white. Fresh like Sauvignon Blanc, with a twist of white pepper and green pea; great with Chinese and Japanese food.",
    ),
  },
  {
    id: "albarino",
    from: ["Sauvignon Blanc", "Pinot Grigio", "Riesling"],
    grape: "Albariño",
    color: "white",
    places: ["Rias Baixas"],
    text: T(
      "西班牙海边的白葡萄：桃子、柠檬和一丝咸味，像海风。酸度清爽，配海鲜几乎不会出错。",
      "西班牙海邊的白葡萄：桃子、檸檬和一絲鹹味，像海風。酸度清爽，配海鮮幾乎不會出錯。",
      "A white from Spain's Atlantic coast: peach, lemon and a salty, sea-breeze edge. Crisp, and almost foolproof with seafood.",
    ),
  },
  {
    id: "viognier",
    from: ["Chardonnay", "Gewürztraminer", "Muscat"],
    grape: "Viognier",
    color: "white",
    places: ["Condrieu"],
    text: T(
      "香气非常浓：杏子、桃子和白花，闻起来像甜的，喝起来却是干的。体会一下“香气浓”和“甜”是两回事。",
      "香氣非常濃：杏桃、水蜜桃和白花，聞起來像甜的，喝起來卻是乾的。體會一下「香氣濃」和「甜」是兩回事。",
      "Hugely aromatic, apricot, peach and white flowers: it smells sweet but tastes dry. A lesson in how “aromatic” and “sweet” are different things.",
    ),
  },
  {
    id: "riesling",
    from: ["Sauvignon Blanc", "Pinot Grigio", "Chardonnay"],
    grape: "Riesling",
    color: "white",
    places: ["region:Mosel", "Wachau"],
    text: T(
      "酸度很高，青苹果、柠檬和白花，陈年后会有一股汽油味（这是好事）。德国的常带一点甜，标签上写 trocken 就是干型。",
      "酸度很高，青蘋果、檸檬和白花，陳年後會有一股汽油味（這是好事）。德國的常帶一點甜，酒標上寫 trocken 就是乾型。",
      "High acidity, green apple, lemon and blossom; with age it picks up a petrol note (a good thing). German ones are often a little sweet; trocken on the label means dry.",
    ),
  },
  {
    id: "pinot-noir",
    from: [],
    grape: "Pinot Noir",
    color: "red",
    places: ["Rully", "Willamette Valley"],
    text: T(
      "最适合入门的红葡萄之一：颜色浅、单宁轻，带樱桃、草莓和一点泥土味。从这里开始，能很快分清“红色水果”和“黑色水果”。",
      "最適合入門的紅葡萄之一：顏色淺、單寧輕，帶櫻桃、草莓和一點泥土味。從這裡開始，能很快分清「紅色水果」和「黑色水果」。",
      "One of the easiest reds to start with: pale, light in tannin, cherry, strawberry and a little earth. It quickly teaches red fruit from black fruit.",
    ),
  },
];

/**
 * The step to suggest: from the grapes I like most (best first), the first entry I have not tried.
 * Falls back to an entry for anyone, then to any untried one.
 */
export function pickStretch(liked: string[], tried: ReadonlySet<string>, skip = 0): Stretch | null {
  const fresh = STRETCHES.filter((s) => !tried.has(s.grape));
  const ranked = [
    ...liked.flatMap((g) => fresh.filter((s) => s.from.includes(g))),
    ...fresh.filter((s) => s.from.length === 0),
    ...fresh,
  ];
  const unique = [...new Map(ranked.map((s) => [s.id, s])).values()];
  return unique.length ? unique[skip % unique.length]! : null;
}
