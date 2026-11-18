/**
 * 香气词表: one vocabulary for my notes, friends' notes and (later) the critics', so they can be
 * compared across languages (docs/design.zh.md §1, §3.8). A note stores the id; each language shows
 * its own word. The structure follows WSET's primary / secondary / tertiary aromas; the words and
 * the plain-language hints are our own. zh-TW uses Taiwan wine vocabulary, not a character swap.
 *
 * Ids are permanent: rename a word freely, never reuse or change an id.
 */

export type Tri = { zh: string; tw: string; en: string };

export interface Family {
  id: string;
  tier: 1 | 2 | 3;
  name: Tri;
}

export interface Descriptor {
  id: string;
  family: string;
  name: Tri;
  /** A everyday thing it smells like, for 入门 (empty when the word says it already). */
  hint?: Tri;
  /** Which colours of wine usually show it: the pickers list these first. */
  for?: ("red" | "white")[];
}

const T = (zh: string, tw: string, en: string): Tri => ({ zh, tw, en });

export const FAMILIES: Family[] = [
  { id: "floral", tier: 1, name: T("花香", "花香", "Floral") },
  { id: "green-fruit", tier: 1, name: T("青色水果", "青色水果", "Green fruit") },
  { id: "citrus", tier: 1, name: T("柑橘", "柑橘", "Citrus") },
  { id: "stone-fruit", tier: 1, name: T("核果", "核果", "Stone fruit") },
  { id: "tropical", tier: 1, name: T("热带水果", "熱帶水果", "Tropical fruit") },
  { id: "red-fruit", tier: 1, name: T("红色水果", "紅色水果", "Red fruit") },
  { id: "black-fruit", tier: 1, name: T("黑色水果", "黑色水果", "Black fruit") },
  { id: "herbaceous", tier: 1, name: T("青草与植物", "青草與植物", "Herbaceous") },
  { id: "herbal", tier: 1, name: T("香草", "香草植物", "Herbal") },
  { id: "spice", tier: 1, name: T("香料", "香料", "Spice") },
  { id: "mineral", tier: 1, name: T("矿物", "礦物", "Mineral") },
  { id: "yeast", tier: 2, name: T("酵母与烘焙", "酵母與烘焙", "Yeast & bakery") },
  { id: "dairy", tier: 2, name: T("奶油", "奶油", "Creamy") },
  { id: "oak", tier: 2, name: T("橡木桶", "橡木桶", "Oak") },
  { id: "dried-fruit", tier: 3, name: T("果干与熟果", "果乾與熟果", "Dried & cooked fruit") },
  { id: "aged", tier: 3, name: T("陈年", "陳年", "Bottle age") },
  { id: "nutty", tier: 3, name: T("坚果与焦糖", "堅果與焦糖", "Nuts & caramel") },
];

export const DESCRIPTORS: Descriptor[] = [
  // 花香
  {
    id: "violet",
    family: "floral",
    name: T("紫罗兰", "紫羅蘭", "Violet"),
    hint: T("香水和紫罗兰糖", "香水和紫羅蘭糖果", "Parma violet sweets, perfume"),
    for: ["red"],
  },
  {
    id: "rose",
    family: "floral",
    name: T("玫瑰", "玫瑰", "Rose"),
    hint: T("玫瑰花瓣、玫瑰香皂", "玫瑰花瓣、玫瑰香皂", "Rose petals, rose soap"),
  },
  {
    id: "white-flowers",
    family: "floral",
    name: T("白花", "白花", "White flowers"),
    hint: T("栀子花、茉莉花茶", "梔子花、茉莉花茶", "Jasmine, gardenia"),
    for: ["white"],
  },
  {
    id: "orange-blossom",
    family: "floral",
    name: T("橙花", "橙花", "Orange blossom"),
    hint: T("橙花水、柑橘花", "橙花水、柑橘花", "Orange flower water"),
    for: ["white"],
  },
  {
    id: "elderflower",
    family: "floral",
    name: T("接骨木花", "接骨木花", "Elderflower"),
    hint: T("接骨木花糖浆，清新带甜", "接骨木花糖漿，清新帶甜", "Elderflower cordial"),
    for: ["white"],
  },
  {
    id: "honeysuckle",
    family: "floral",
    name: T("金银花", "金銀花", "Honeysuckle"),
    hint: T("金银花露", "金銀花露", "Sweet summer hedge flowers"),
    for: ["white"],
  },
  {
    id: "lavender",
    family: "floral",
    name: T("薰衣草", "薰衣草", "Lavender"),
    hint: T("薰衣草香包", "薰衣草香包", "Lavender sachet"),
  },
  // 青色水果
  {
    id: "green-apple",
    family: "green-fruit",
    name: T("青苹果", "青蘋果", "Green apple"),
    hint: T("刚切开的青苹果，脆而酸", "剛切開的青蘋果，脆而酸", "Granny Smith, just cut"),
    for: ["white"],
  },
  {
    id: "pear",
    family: "green-fruit",
    name: T("梨", "西洋梨", "Pear"),
    hint: T("熟透的梨，汁水多", "熟透的西洋梨，汁水多", "Ripe, juicy pear"),
    for: ["white"],
  },
  {
    id: "gooseberry",
    family: "green-fruit",
    name: T("醋栗", "鵝莓", "Gooseberry"),
    hint: T("青涩微酸的浆果", "青澀微酸的漿果", "Tart green berries"),
    for: ["white"],
  },
  {
    id: "green-grape",
    family: "green-fruit",
    name: T("青葡萄", "青葡萄", "Green grape"),
    hint: T("新鲜的绿葡萄", "新鮮的綠葡萄", "Fresh white grapes"),
    for: ["white"],
  },
  // 柑橘
  {
    id: "lemon",
    family: "citrus",
    name: T("柠檬", "檸檬", "Lemon"),
    hint: T("柠檬皮、柠檬汁", "檸檬皮、檸檬汁", "Lemon zest and juice"),
    for: ["white"],
  },
  {
    id: "lime",
    family: "citrus",
    name: T("青柠", "萊姆", "Lime"),
    hint: T("青柠皮，比柠檬更尖", "萊姆皮，比檸檬更尖", "Lime zest, sharper than lemon"),
    for: ["white"],
  },
  {
    id: "grapefruit",
    family: "citrus",
    name: T("西柚", "葡萄柚", "Grapefruit"),
    hint: T("西柚果肉，带一点苦", "葡萄柚果肉，帶一點苦", "Pink grapefruit, a little bitter"),
    for: ["white"],
  },
  {
    id: "orange-peel",
    family: "citrus",
    name: T("橙皮", "橙皮", "Orange peel"),
    hint: T("剥橙子时手上的味道", "剝柳橙時手上的味道", "Peeling an orange"),
  },
  // 核果
  {
    id: "peach",
    family: "stone-fruit",
    name: T("桃子", "水蜜桃", "Peach"),
    hint: T("熟水蜜桃", "熟水蜜桃", "Ripe white peach"),
    for: ["white"],
  },
  {
    id: "apricot",
    family: "stone-fruit",
    name: T("杏", "杏桃", "Apricot"),
    hint: T("杏子果酱", "杏桃果醬", "Apricot jam"),
    for: ["white"],
  },
  { id: "nectarine", family: "stone-fruit", name: T("油桃", "油桃", "Nectarine"), for: ["white"] },
  // 热带水果
  { id: "pineapple", family: "tropical", name: T("菠萝", "鳳梨", "Pineapple"), for: ["white"] },
  { id: "mango", family: "tropical", name: T("芒果", "芒果", "Mango"), for: ["white"] },
  {
    id: "passion-fruit",
    family: "tropical",
    name: T("百香果", "百香果", "Passion fruit"),
    hint: T("酸甜浓郁，很冲", "酸甜濃郁，很衝", "Tangy and loud"),
    for: ["white"],
  },
  { id: "lychee", family: "tropical", name: T("荔枝", "荔枝", "Lychee"), for: ["white"] },
  {
    id: "melon",
    family: "tropical",
    name: T("哈密瓜", "哈密瓜", "Melon"),
    hint: T("甜瓜、哈密瓜", "香瓜、哈密瓜", "Honeydew, cantaloupe"),
    for: ["white"],
  },
  { id: "banana", family: "tropical", name: T("香蕉", "香蕉", "Banana") },
  // 红色水果
  { id: "strawberry", family: "red-fruit", name: T("草莓", "草莓", "Strawberry"), for: ["red"] },
  {
    id: "raspberry",
    family: "red-fruit",
    name: T("覆盆子", "覆盆子", "Raspberry"),
    hint: T("树莓，甜里带酸", "樹莓，甜裡帶酸", "Fresh raspberries"),
    for: ["red"],
  },
  {
    id: "red-cherry",
    family: "red-fruit",
    name: T("红樱桃", "紅櫻桃", "Red cherry"),
    hint: T("新鲜的红樱桃，偏酸", "新鮮的紅櫻桃，偏酸", "Fresh red cherries"),
    for: ["red"],
  },
  {
    id: "cranberry",
    family: "red-fruit",
    name: T("蔓越莓", "蔓越莓", "Cranberry"),
    hint: T("蔓越莓汁，酸", "蔓越莓汁，酸", "Tart cranberry juice"),
    for: ["red"],
  },
  { id: "red-plum", family: "red-fruit", name: T("红李子", "紅李子", "Red plum"), for: ["red"] },
  { id: "pomegranate", family: "red-fruit", name: T("石榴", "石榴", "Pomegranate"), for: ["red"] },
  // 黑色水果
  {
    id: "blackcurrant",
    family: "black-fruit",
    name: T("黑醋栗", "黑醋栗", "Blackcurrant"),
    hint: T("黑加仑汁、黑加仑糖", "黑醋栗汁、黑醋栗軟糖", "Blackcurrant cordial, cassis"),
    for: ["red"],
  },
  {
    id: "blackberry",
    family: "black-fruit",
    name: T("黑莓", "黑莓", "Blackberry"),
    hint: T("黑莓果酱", "黑莓果醬", "Bramble, blackberry jam"),
    for: ["red"],
  },
  {
    id: "black-cherry",
    family: "black-fruit",
    name: T("黑樱桃", "黑櫻桃", "Black cherry"),
    hint: T("熟透的车厘子", "熟透的櫻桃", "Ripe dark cherries"),
    for: ["red"],
  },
  { id: "blueberry", family: "black-fruit", name: T("蓝莓", "藍莓", "Blueberry"), for: ["red"] },
  { id: "black-plum", family: "black-fruit", name: T("黑李子", "黑李子", "Black plum"), for: ["red"] },
  { id: "mulberry", family: "black-fruit", name: T("桑葚", "桑椹", "Mulberry"), for: ["red"] },
  // 青草与植物
  {
    id: "grass",
    family: "herbaceous",
    name: T("青草", "青草", "Cut grass"),
    hint: T("刚割过的草坪", "剛割過的草坪", "A freshly mown lawn"),
    for: ["white"],
  },
  {
    id: "green-pepper",
    family: "herbaceous",
    name: T("青椒", "青椒", "Green bell pepper"),
    hint: T("切开的青椒", "切開的青椒", "Cut green pepper"),
  },
  {
    id: "tomato-leaf",
    family: "herbaceous",
    name: T("番茄叶", "番茄葉", "Tomato leaf"),
    hint: T("摘番茄时手上的青味", "摘番茄時手上的青味", "Your hands after picking tomatoes"),
  },
  {
    id: "eucalyptus",
    family: "herbaceous",
    name: T("桉树", "尤加利", "Eucalyptus"),
    hint: T("清凉油、薄荷糖", "綠油精、薄荷糖", "Vicks, menthol"),
    for: ["red"],
  },
  {
    id: "mint",
    family: "herbaceous",
    name: T("薄荷", "薄荷", "Mint"),
    hint: T("新鲜薄荷叶", "新鮮薄荷葉", "Fresh mint leaves"),
    for: ["red"],
  },
  // 香草
  {
    id: "thyme",
    family: "herbal",
    name: T("百里香", "百里香", "Thyme"),
    hint: T("烤肉用的干香草", "烤肉用的乾香草", "Dried herbs for a roast"),
  },
  {
    id: "dried-herbs",
    family: "herbal",
    name: T("干香草", "乾燥香草", "Dried herbs"),
    hint: T("意面酱里的干香草碎", "義大利麵醬裡的乾香草", "Herbes de Provence, oregano"),
  },
  {
    id: "black-tea",
    family: "herbal",
    name: T("红茶", "紅茶", "Black tea"),
    hint: T("泡开的红茶叶", "泡開的紅茶葉", "Wet tea leaves"),
  },
  {
    id: "fennel",
    family: "herbal",
    name: T("茴香", "茴香", "Fennel"),
    hint: T("小茴香、八角", "小茴香、八角", "Fennel, aniseed"),
  },
  // 香料
  {
    id: "black-pepper",
    family: "spice",
    name: T("黑胡椒", "黑胡椒", "Black pepper"),
    hint: T("现磨黑胡椒", "現磨黑胡椒", "Freshly cracked pepper"),
    for: ["red"],
  },
  {
    id: "clove",
    family: "spice",
    name: T("丁香", "丁香", "Clove"),
    hint: T("卤料、热红酒里的丁香", "滷包、熱紅酒裡的丁香", "Mulled wine, clove"),
  },
  {
    id: "cinnamon",
    family: "spice",
    name: T("肉桂", "肉桂", "Cinnamon"),
    hint: T("肉桂卷", "肉桂捲", "Cinnamon roll"),
  },
  {
    id: "licorice",
    family: "spice",
    name: T("甘草", "甘草", "Licorice"),
    hint: T("甘草片、话梅里的甘草味", "甘草片、蜜餞裡的甘草味", "Liquorice sticks"),
    for: ["red"],
  },
  { id: "ginger", family: "spice", name: T("姜", "薑", "Ginger"), for: ["white"] },
  // 矿物
  {
    id: "wet-stone",
    family: "mineral",
    name: T("湿石头", "濕石頭", "Wet stones"),
    hint: T("雨后的石板路", "雨後的石板路", "Pavement after rain"),
    for: ["white"],
  },
  {
    id: "flint",
    family: "mineral",
    name: T("打火石", "打火石", "Flint"),
    hint: T("划火柴、打火机的火石味", "劃火柴、打火機的火石味", "A struck match"),
  },
  {
    id: "chalk",
    family: "mineral",
    name: T("粉笔", "粉筆", "Chalk"),
    hint: T("黑板粉笔", "黑板粉筆", "Blackboard chalk"),
    for: ["white"],
  },
  {
    id: "graphite",
    family: "mineral",
    name: T("铅笔芯", "鉛筆芯", "Graphite"),
    hint: T("削铅笔时的笔芯味", "削鉛筆時的筆芯味", "Pencil lead"),
    for: ["red"],
  },
  {
    id: "saline",
    family: "mineral",
    name: T("咸味", "鹹味", "Saline"),
    hint: T("海风、海盐", "海風、海鹽", "Sea breeze, sea salt"),
    for: ["white"],
  },
  // 酵母与烘焙
  {
    id: "bread",
    family: "yeast",
    name: T("面包", "麵包", "Bread"),
    hint: T("刚出炉的面包、面团", "剛出爐的麵包、麵團", "Fresh bread, dough"),
    for: ["white"],
  },
  {
    id: "brioche",
    family: "yeast",
    name: T("布里欧修", "布里歐", "Brioche"),
    hint: T("黄油面包", "奶油麵包", "Buttery sweet bread"),
    for: ["white"],
  },
  {
    id: "biscuit",
    family: "yeast",
    name: T("饼干", "餅乾", "Biscuit"),
    hint: T("消化饼干", "消化餅乾", "Digestive biscuit"),
    for: ["white"],
  },
  // 奶油
  {
    id: "butter",
    family: "dairy",
    name: T("黄油", "奶油", "Butter"),
    hint: T("黄油爆米花", "奶油爆米花", "Buttered popcorn"),
    for: ["white"],
  },
  {
    id: "cream",
    family: "dairy",
    name: T("奶油", "鮮奶油", "Cream"),
    hint: T("鲜奶油", "鮮奶油", "Fresh cream"),
    for: ["white"],
  },
  { id: "yogurt", family: "dairy", name: T("酸奶", "優格", "Yogurt") },
  // 橡木桶
  {
    id: "vanilla",
    family: "oak",
    name: T("香草", "香草", "Vanilla"),
    hint: T("香草冰淇淋", "香草冰淇淋", "Vanilla ice cream"),
  },
  {
    id: "cedar",
    family: "oak",
    name: T("雪松", "雪松", "Cedar"),
    hint: T("削铅笔的木头味", "削鉛筆的木頭味", "Pencil shavings, cigar box"),
    for: ["red"],
  },
  {
    id: "toast",
    family: "oak",
    name: T("烤面包", "烤吐司", "Toast"),
    hint: T("烤焦一点的吐司", "烤焦一點的吐司", "Slightly burnt toast"),
  },
  {
    id: "smoke",
    family: "oak",
    name: T("烟熏", "煙燻", "Smoke"),
    hint: T("篝火、烟熏培根", "營火、煙燻培根", "Campfire, smoked bacon"),
    for: ["red"],
  },
  {
    id: "coconut",
    family: "oak",
    name: T("椰子", "椰子", "Coconut"),
    hint: T("椰丝、椰子糖", "椰子絲、椰子糖", "Desiccated coconut"),
    for: ["red"],
  },
  {
    id: "chocolate",
    family: "oak",
    name: T("巧克力", "巧克力", "Chocolate"),
    hint: T("黑巧克力、可可粉", "黑巧克力、可可粉", "Dark chocolate, cocoa"),
    for: ["red"],
  },
  {
    id: "coffee",
    family: "oak",
    name: T("咖啡", "咖啡", "Coffee"),
    hint: T("咖啡豆", "咖啡豆", "Roasted coffee beans"),
    for: ["red"],
  },
  {
    id: "cigar-box",
    family: "oak",
    name: T("雪茄盒", "雪茄盒", "Cigar box"),
    hint: T("雪松木盒子里的烟草", "雪松木盒子裡的菸草", "Cedar and tobacco together"),
    for: ["red"],
  },
  // 果干与熟果
  {
    id: "fig",
    family: "dried-fruit",
    name: T("无花果", "無花果", "Fig"),
    hint: T("无花果干", "無花果乾", "Dried figs"),
  },
  {
    id: "prune",
    family: "dried-fruit",
    name: T("西梅", "黑棗", "Prune"),
    hint: T("西梅干", "黑棗乾", "Dried plums"),
    for: ["red"],
  },
  { id: "raisin", family: "dried-fruit", name: T("葡萄干", "葡萄乾", "Raisin") },
  {
    id: "jam",
    family: "dried-fruit",
    name: T("果酱", "果醬", "Jam"),
    hint: T("煮过的浆果酱", "煮過的莓果醬", "Cooked berry jam"),
    for: ["red"],
  },
  { id: "dried-apricot", family: "dried-fruit", name: T("杏干", "杏桃乾", "Dried apricot"), for: ["white"] },
  { id: "marmalade", family: "dried-fruit", name: T("橘子酱", "柑橘果醬", "Marmalade"), for: ["white"] },
  // 陈年
  {
    id: "leather",
    family: "aged",
    name: T("皮革", "皮革", "Leather"),
    hint: T("新皮包、皮鞋", "新皮包、皮鞋", "A new leather bag"),
    for: ["red"],
  },
  {
    id: "earth",
    family: "aged",
    name: T("泥土", "泥土", "Earth"),
    hint: T("雨后的泥土", "雨後的泥土", "Damp soil after rain"),
    for: ["red"],
  },
  {
    id: "mushroom",
    family: "aged",
    name: T("蘑菇", "蘑菇", "Mushroom"),
    hint: T("香菇、蘑菇汤", "香菇、蘑菇湯", "Mushrooms, mushroom soup"),
  },
  {
    id: "forest-floor",
    family: "aged",
    name: T("林下落叶", "森林地表", "Forest floor"),
    hint: T("树林里潮湿的落叶", "樹林裡潮濕的落葉", "Wet leaves in a wood"),
    for: ["red"],
  },
  {
    id: "tobacco",
    family: "aged",
    name: T("烟草", "菸草", "Tobacco"),
    hint: T("没点燃的烟丝", "沒點燃的菸絲", "Unlit pipe tobacco"),
    for: ["red"],
  },
  {
    id: "game",
    family: "aged",
    name: T("野味", "野味", "Game"),
    hint: T("生肉、腊肉", "生肉、臘肉", "Raw meat, cured meat"),
    for: ["red"],
  },
  { id: "honey", family: "aged", name: T("蜂蜜", "蜂蜜", "Honey"), for: ["white"] },
  {
    id: "petrol",
    family: "aged",
    name: T("汽油", "汽油", "Petrol"),
    hint: T("加油站、新橡胶", "加油站、新橡膠", "A petrol station, new rubber"),
    for: ["white"],
  },
  // 坚果与焦糖
  {
    id: "almond",
    family: "nutty",
    name: T("杏仁", "杏仁", "Almond"),
    hint: T("杏仁、杏仁饼", "杏仁、杏仁餅", "Almonds, marzipan"),
    for: ["white"],
  },
  { id: "hazelnut", family: "nutty", name: T("榛子", "榛果", "Hazelnut"), for: ["white"] },
  { id: "walnut", family: "nutty", name: T("核桃", "核桃", "Walnut") },
  {
    id: "caramel",
    family: "nutty",
    name: T("焦糖", "焦糖", "Caramel"),
    hint: T("焦糖布丁上的那层", "焦糖布丁上的那層", "Crème brûlée top"),
  },
  { id: "toffee", family: "nutty", name: T("太妃糖", "太妃糖", "Toffee") },
];

export const DESCRIPTOR_BY_ID = new Map(DESCRIPTORS.map((d) => [d.id, d]));
export const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));
export const isDescriptorId = (id: unknown): id is string => typeof id === "string" && DESCRIPTOR_BY_ID.has(id);

/**
 * 入门's way down the tree: first a broad question in everyday words, then for fruit a second
 * question, and only then 4–6 words (docs/design.zh.md §3.4).
 */
export interface BeginnerGroup {
  id: string;
  name: Tri;
  /** Shown under the button: what it covers. */
  sub: Tri;
  /** Either the families shown straight away, or a second question to narrow it. */
  families?: string[];
  branches?: { name: Tri; families: string[] }[];
}

export const BEGINNER_GROUPS: BeginnerGroup[] = [
  {
    id: "fruit",
    name: T("水果", "水果", "Fruit"),
    sub: T("莓果、樱桃、柑橘、桃子……", "莓果、櫻桃、柑橘、桃子……", "Berries, cherries, citrus, peaches…"),
    branches: [
      { name: T("红色的果子", "紅色的果子", "Red fruit"), families: ["red-fruit"] },
      { name: T("黑色、紫色的果子", "黑色、紫色的果子", "Black or purple fruit"), families: ["black-fruit"] },
      { name: T("柠檬、青苹果", "檸檬、青蘋果", "Lemon, green apple"), families: ["citrus", "green-fruit"] },
      { name: T("桃子、热带水果", "水蜜桃、熱帶水果", "Peach, tropical fruit"), families: ["stone-fruit", "tropical"] },
      { name: T("果干、果酱", "果乾、果醬", "Dried fruit, jam"), families: ["dried-fruit"] },
    ],
  },
  {
    id: "flowers",
    name: T("花和草", "花和草", "Flowers & greens"),
    sub: T("花香、青草、薄荷、香草", "花香、青草、薄荷、香草", "Flowers, grass, mint, herbs"),
    families: ["floral", "herbaceous", "herbal"],
  },
  {
    id: "spice",
    name: T("香料和木头", "香料和木頭", "Spice & wood"),
    sub: T("胡椒、香草冰淇淋、烟熏、巧克力", "胡椒、香草冰淇淋、煙燻、巧克力", "Pepper, vanilla, smoke, chocolate"),
    families: ["spice", "oak"],
  },
  {
    id: "bakery",
    name: T("面包和奶油", "麵包和奶油", "Bread & butter"),
    sub: T("面包、黄油、坚果、蜂蜜", "麵包、奶油、堅果、蜂蜜", "Bread, butter, nuts, honey"),
    families: ["yeast", "dairy", "nutty"],
  },
  {
    id: "earth",
    name: T("泥土和皮革", "泥土和皮革", "Earth & leather"),
    sub: T("泥土、蘑菇、皮革、石头", "泥土、蘑菇、皮革、石頭", "Soil, mushroom, leather, stones"),
    families: ["aged", "mineral"],
  },
];

/** The words of some families, the ones usual for this colour of wine first. */
export function wordsOf(families: string[], color: "red" | "white"): Descriptor[] {
  const words = DESCRIPTORS.filter((d) => families.includes(d.family));
  const usual = (d: Descriptor) => !d.for || d.for.includes(color);
  return [...words.filter(usual), ...words.filter((d) => !usual(d))];
}
