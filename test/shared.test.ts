import { describe, expect, it } from "vitest";
import { avaOf } from "../src/shared/ava";
import { appellationsIn, areasIn, placePath, tidyPlace } from "../src/shared/place";
import { BEGINNER_GROUPS, DESCRIPTORS, FAMILIES } from "../src/shared/descriptors";
import { toCsv, toJson } from "../src/shared/export";
import { compareLine, nudge, previousTasting } from "../src/shared/compare";
import { growthOf, suggestStandard } from "../src/shared/growth";
import { aromasInNote } from "../src/shared/notewords";
import { GRAPES, canonicalGrape, commonGrapes, grapeName } from "../src/shared/grapes";
import { beginnerQuestions, glassColor, huesFor, tastingNote } from "../src/shared/guide";
import { COLORS, ID_RE, nameKey, ulid } from "../src/shared/model";
import { type ProseTasting, type ProseWine, tastingFacts, wineFacts, wrap } from "../src/shared/prose";

describe("vocabulary", () => {
  it("has unique ids, every word in a family, all three languages", () => {
    const ids = DESCRIPTORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const families = new Set(FAMILIES.map((f) => f.id));
    for (const d of DESCRIPTORS) {
      expect(families.has(d.family)).toBe(true);
      expect(d.name.zh && d.name.tw && d.name.en).toBeTruthy();
      if (d.hint) expect(d.hint.zh && d.hint.tw && d.hint.en).toBeTruthy();
    }
    for (const g of BEGINNER_GROUPS)
      for (const f of [...(g.families ?? []), ...(g.branches ?? []).flatMap((b) => b.families)])
        expect(families.has(f)).toBe(true);
  });
});

describe("beginner questions", () => {
  it("asks about tannin only for reds and bubbles only for sparkling", () => {
    const red = beginnerQuestions("red").map((q) => q.field);
    const white = beginnerQuestions("white").map((q) => q.field);
    expect(red).toContain("palate.tannin");
    expect(white).not.toContain("palate.tannin");
    expect(beginnerQuestions("sparkling").map((q) => q.field)).toContain("palate.mousse");
  });

  it("turns answers into a taster's note in each language", () => {
    const args = [
      "red",
      { hue: "ruby", intensity: 3 },
      { intensity: 3 },
      { tannin: 5, acidity: 4, finish: 5 },
      ["blackcurrant", "cedar"],
    ] as const;
    expect(tastingNote("zh-CN", ...args)).toBe("深宝石红，黑醋栗和雪松香气，高单宁，中高酸度，余味长");
    expect(tastingNote("zh-TW", ...args)).toBe("深寶石紅，黑醋栗和雪松香氣，高單寧，中高酸度，餘韻長");
    expect(tastingNote("en", ...args)).toBe(
      "Deep ruby, aromas of blackcurrant and cedar, high tannin, medium+ acidity, long finish",
    );
    expect(tastingNote("en", "white", {}, {}, {}, [])).toBe("");
  });

  it("adds what was tasted after what was smelled", () => {
    const palate = { body: 4 as const, flavours: ["black-cherry", "vanilla"] };
    expect(tastingNote("zh-CN", "red", {}, {}, palate, ["cedar"])).toBe("雪松香气，酒体偏饱满，口中有黑樱桃和香草");
    expect(tastingNote("en", "red", {}, {}, palate, [])).toBe("Medium+ body, flavours of black cherry and vanilla");
  });

  it("offers brown to both red and white without mixing their hue sets", () => {
    expect(huesFor("red", "brown")).toContain("tawny");
    expect(huesFor("white", "brown")).toContain("amber");
    expect(huesFor("dessert", "brown")).toContain("gold");
  });
});

describe("helpers", () => {
  it("makes sortable ids", () => {
    const a = ulid(1_700_000_000_000),
      b = ulid(1_700_000_000_001);
    expect(ID_RE.test(a)).toBe(true);
    expect(a < b).toBe(true);
  });

  it("gives two spellings of a producer one key", () => {
    expect(nameKey("Château Montelena Winery", true)).toBe(nameKey("chateau montelena", true));
    expect(nameKey("Ridge Vineyards", true)).toBe("ridge");
    expect(nameKey("Winery", true)).toBe("winery");
  });

  it("knows grapes in every language", () => {
    expect(canonicalGrape("赤霞珠")).toBe("Cabernet Sauvignon");
    expect(canonicalGrape("卡本內蘇維濃")).toBe("Cabernet Sauvignon");
    expect(canonicalGrape("shiraz")).toBe("Syrah");
    expect(grapeName("Chardonnay", "zh-TW")).toBe("夏多內");
    expect(canonicalGrape("Blaufränkisch")).toBe("Blaufränkisch");
    expect(canonicalGrape("Tannat")).toBe("Tannat");
    expect(canonicalGrape("Not A Grape")).toBe("Not A Grape");
  });

  it("offers known grapes as one-tap chips for every colour", () => {
    const known = new Set(GRAPES.map((g) => g.en));
    for (const c of [...COLORS, undefined]) {
      const common = commonGrapes(c);
      expect(common.length).toBeGreaterThan(4);
      for (const g of common) expect(known.has(g), g).toBe(true);
    }
    expect(commonGrapes("white")[0]).toBe("Chardonnay");
    expect(new Set(GRAPES.map((g) => g.zh)).size).toBe(GRAPES.length);
  });

  it("gives a glass colour without an appearance", () => {
    expect(glassColor("red", undefined, new Date().getFullYear())).toMatch(/^#/);
    expect(glassColor("white", { hue: "gold", intensity: 3 })).toBe("#c9952f");
  });
});

describe("American appellations", () => {
  it("knows each AVA's 大区 and state", () => {
    expect(avaOf("oakville")).toEqual({ name: "Oakville", area: "Napa Valley", state: "California", states: ["CA"] });
    expect(avaOf("Napa Valley")?.area).toBe("Napa Valley");
    expect(avaOf("Russian River Valley")?.area).toBe("Sonoma County");
    expect(avaOf("Petaluma Gap")?.area).toBe("Sonoma County");
    expect(avaOf("Sta. Rita Hills")?.area).toBe("Santa Barbara County");
    expect(avaOf("Adelaida District")?.area).toBe("Paso Robles");
    expect(avaOf("Eola-Amity Hills")?.area).toBe("Willamette Valley");
    expect(avaOf("Los Carneros")?.area).toBe("");
    expect(avaOf("Columbia Valley")?.state).toBe("");
    expect(avaOf("Bordeaux")).toBeNull();
  });
});

describe("产区 levels", () => {
  const tidy = (
    country: string | null,
    region: string | null,
    appellation: string | null,
    area: string | null = null,
  ) => tidyPlace({ country, region, area, appellation });

  it("puts Napa Valley and Médoc at the same level", () => {
    expect(placePath({ region: "California", appellation: "Oakville" })).toEqual([
      "California",
      "Napa Valley",
      "Oakville",
    ]);
    expect(placePath({ region: "Bordeaux", appellation: "Pauillac" })).toEqual(["Bordeaux", "Médoc", "Pauillac"]);
    expect(placePath({ region: "Burgundy", appellation: "Gevrey-Chambertin" })).toEqual([
      "Burgundy",
      "Côte de Nuits",
      "Gevrey-Chambertin",
    ]);
    expect(placePath({ region: "California", appellation: "Napa Valley" })).toEqual(["California", "Napa Valley"]);
    expect(placePath({ region: "Tuscany", area: "Chianti", appellation: "Chianti Classico" })).toEqual([
      "Tuscany",
      "Chianti",
      "Chianti Classico",
    ]);
    expect(placePath({ region: "Bordeaux", appellation: "Bordeaux" })).toEqual(["Bordeaux"]);
    expect(placePath({ region: null, appellation: null })).toEqual([]);
  });

  it("finds appellations spelt without accents, as LWIN does", () => {
    expect(placePath({ region: "Bordeaux", appellation: "Saint-Emilion Grand Cru" })[1]).toBe("Rive Droite");
    expect(placePath({ region: "Bordeaux", appellation: "Moulis en Medoc" })[1]).toBe("Médoc");
    expect(placePath({ region: "Rhone", appellation: "Cote Rotie" })[1]).toBe("Northern Rhône");
  });

  it("moves a 大区 or AVA typed as the 产区 to its own level, and keeps what was typed", () => {
    expect(tidy("", "Napa Valley", "Oakville")).toEqual({
      country: "USA",
      region: "California",
      area: "Napa Valley",
      appellation: "Oakville",
    });
    expect(tidy(null, "Sonoma County", null)).toEqual({
      country: "USA",
      region: "California",
      area: "Sonoma County",
      appellation: null,
    });
    expect(tidy(null, "Oakville", null)).toEqual({
      country: "USA",
      region: "California",
      area: "Napa Valley",
      appellation: "Oakville",
    });
    expect(tidy("France", "Médoc", "Pauillac")).toEqual({
      country: "France",
      region: "Bordeaux",
      area: "Médoc",
      appellation: "Pauillac",
    });
    // Sonoma Coast is not in Napa Valley: nothing is thrown away.
    expect(tidy("USA", "Napa Valley", "Sonoma Coast")).toEqual({
      country: "USA",
      region: "Napa Valley",
      area: null,
      appellation: "Sonoma Coast",
    });
  });

  it("fills 大区, 产区 and country from the 子产区, but keeps a 大区 typed by hand", () => {
    expect(tidy(null, null, "Oakville")).toEqual({
      country: "USA",
      region: "California",
      area: "Napa Valley",
      appellation: "Oakville",
    });
    expect(tidy(null, null, "Pauillac")).toEqual({
      country: "France",
      region: "Bordeaux",
      area: "Médoc",
      appellation: "Pauillac",
    });
    expect(tidy("United States", "California", "Oakville").country).toBe("USA");
    expect(tidy("Italy", "Tuscany", "Chianti Classico", "Chianti")).toEqual({
      country: "Italy",
      region: "Tuscany",
      area: "Chianti",
      appellation: "Chianti Classico",
    });
    expect(tidy(null, "Tuscany", null).country).toBe("Italy");
    expect(tidy(null, null, null)).toEqual({ country: null, region: null, area: null, appellation: null });
  });
});

describe("子产区 suggestions", () => {
  it("narrow to the 产区 and 大区 already filled in", () => {
    const ca = appellationsIn("California");
    expect(ca).toContain("Oakville");
    expect(ca).not.toContain("Willamette Valley");
    expect(ca).not.toContain("Pauillac");
    const napa = appellationsIn("California", "Napa Valley");
    expect(napa).toContain("Rutherford");
    expect(napa).not.toContain("Russian River Valley");
    expect(appellationsIn("Bordeaux")).toContain("Pauillac");
    expect(appellationsIn("Bordeaux")).not.toContain("Oakville");
    expect(appellationsIn(null).length).toBeGreaterThan(300);
    expect(areasIn("California")).toEqual(expect.arrayContaining(["Napa Valley", "Sonoma County", "Paso Robles"]));
    expect(areasIn("Bordeaux")).toEqual(["Graves", "Médoc", "Rive Droite"]);
  });
});

describe("export", () => {
  const v = {
    id: "V1",
    wineId: "W1",
    producer: "Ridge",
    wine: 'Monte Bello, "Estate"',
    year: 2019,
    color: "red" as const,
    country: "USA",
    region: "California",
    area: null,
    appellation: "Santa Cruz Mountains",
    grapes: ["Cabernet Sauvignon"],
    abv: 13.5,
  };
  const tasting = {
    id: "T1",
    vintageId: "V1",
    listItemId: "I1",
    tastedAt: "2026-11-18T20:00:00.000Z",
    depth: "standard" as const,
    appearance: { intensity: 3 as const, hue: "ruby" },
    nose: { intensity: 4 as const },
    palate: { tannin: 5 as const },
    extra: {},
    guesses: {},
    descriptors: [{ id: "blackcurrant", intensity: 2 }],
    quality: null,
    score: 94,
    buyAgain: true,
    boughtQty: null,
    priceUsd: 250,
    note: "=1+1 line\nbreak",
    photoId: null,
    updatedAt: "2026-11-18T20:00:00.000Z",
  };
  const data = {
    lists: [
      {
        id: "L1",
        title: "Napa",
        kind: "winery" as const,
        startsOn: null,
        place: null,
        note: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    items: [{ id: "I1", listId: "L1", vintageId: "V1", position: 0, priceUsd: null, createdAt: "" }],
    vintages: [v],
    tastings: [tasting],
  };

  it("writes one row per note, quoted and defused, headers in the language", () => {
    const csv = toCsv(data, "zh-CN");
    expect(csv.startsWith("﻿日期,酒庄,酒名")).toBe(true);
    const [, row] = csv.slice(1).split("\r\n");
    expect(row).toContain('"Monte Bello, ""Estate"""');
    expect(row).toContain("赤霞珠");
    expect(row).toContain("Napa");
    expect(row).toContain("黑醋栗");
    expect(row).toContain('"\'=1+1 line\nbreak"');
    expect(toCsv(data, "en")).toContain("Date,Producer,Wine");
  });

  it("keeps everything in JSON", () => {
    const back = JSON.parse(toJson(data, "x"));
    expect(back.tastings[0]).toEqual(tasting);
    expect(back.vintages[0]).toEqual(v);
  });
});

describe("aromas in a note", () => {
  it("finds the vocabulary's words in any language, longest first", () => {
    expect(aromasInNote("很多黑樱桃和雪茄盒，单宁有点紧", "zh-CN")).toEqual(["black-cherry", "cigar-box"]);
    expect(aromasInNote("黑醋栗、杏仁", "zh-CN")).toEqual(["blackcurrant", "almond"]);
    expect(aromasInNote("Lots of cassis, cedar and a smoky finish", "en")).toEqual(["blackcurrant", "cedar", "smoke"]);
    expect(aromasInNote("Pineapple; not much oak", "en")).toEqual(["pineapple"]);
    expect(aromasInNote("applesauce", "en")).toEqual([]);
  });
  it("skips words after a negation", () => {
    expect(aromasInNote("没有玫瑰，有一点黑莓", "zh-CN")).toEqual(["blackberry"]);
    expect(aromasInNote("no vanilla, some cherries", "en")).toEqual(["red-cherry"]);
  });
  it("reads 奶油 as each language means it", () => {
    expect(aromasInNote("奶油", "zh-CN")).toEqual(["cream"]);
    expect(aromasInNote("奶油", "zh-TW")).toEqual(["butter"]);
  });
});

describe("compare with the last wine", () => {
  const base = {
    vintageId: "V",
    tastedAt: "",
    depth: "beginner" as const,
    appearance: {},
    extra: {},
    guesses: {},
    descriptors: [],
    quality: null,
    buyAgain: null,
    boughtQty: null,
    priceUsd: null,
    note: null,
    photoId: null,
    updatedAt: "2026-11-18T00:00:00Z",
  };
  const items = [
    { id: "I1", listId: "L", vintageId: "V1", position: 0, priceUsd: null, createdAt: "" },
    { id: "I2", listId: "L", vintageId: "V2", position: 1, priceUsd: null, createdAt: "" },
    { id: "I3", listId: "L", vintageId: "V3", position: 2, priceUsd: null, createdAt: "" },
    { id: "J1", listId: "M", vintageId: "V4", position: 0, priceUsd: null, createdAt: "" },
  ];
  const t1 = {
    ...base,
    id: "T1",
    listItemId: "I1",
    nose: {},
    palate: { tannin: 3 as const, acidity: 4 as const },
    score: 90,
  };
  const t3 = {
    ...base,
    id: "T3",
    listItemId: "I3",
    nose: {},
    palate: { tannin: 5 as const, acidity: 4 as const },
    score: 93,
  };

  it("finds the nearest earlier wine I have a note on, in the same list", () => {
    expect(previousTasting(t3, items, [t1, t3])?.id).toBe("T1");
    expect(previousTasting(t1, items, [t1, t3])).toBeNull();
    expect(previousTasting({ id: "X", listItemId: null }, items, [t1])).toBeNull();
  });

  it("says how they differ and keeps nudges on the scale", () => {
    expect(compareLine("zh-CN", t3, t1)).toBe("和上一款比：酸度差不多，单宁更高，我的分高 3 分");
    expect(compareLine("en", t3, t1)).toBe(
      "Compared with the last wine: acidity about the same, tannin higher, 3 points higher on my score",
    );
    expect(nudge("palate.tannin", 5, 1)).toBe(5);
    expect(nudge("palate.sweetness", 5, 1)).toBe(6);
    expect(nudge("palate.body", 1, -1)).toBe(1);
  });
});

describe("growth", () => {
  const note = (id: string, at: string, wine: string, ids: string[], score: number | null, depth = "beginner") => ({
    id,
    vintageId: wine,
    listItemId: null,
    tastedAt: at,
    depth: depth as "beginner",
    appearance: {},
    nose: {},
    palate: {},
    extra: {},
    guesses: {},
    descriptors: ids.map((d) => ({ id: d, intensity: 2 })),
    quality: null,
    score,
    buyAgain: null,
    boughtQty: null,
    priceUsd: null,
    note: null,
    photoId: null,
    updatedAt: at,
  });
  const wine = (id: string, wineId: string, grapes: string[], country: string, region: string) => ({
    id,
    wineId,
    producer: "P",
    wine: id,
    year: 2020,
    color: "red" as const,
    country,
    region,
    appellation: null,
    grapes,
    abv: null,
  });
  const vintages = [
    wine("V1", "W1", ["Cabernet Sauvignon"], "USA", "California"),
    wine("V2", "W1", ["Cabernet Sauvignon"], "USA", "California"),
    wine("V3", "W3", ["Pinot Noir"], "France", "Burgundy"),
  ];
  const tastings = [
    note("A", "2026-10-03T10:00:00Z", "V1", ["blackcurrant"], 88),
    note("B", "2026-11-02T10:00:00Z", "V2", ["blackcurrant", "cedar", "vanilla"], 92),
    note("C", "2026-11-05T10:00:00Z", "V3", ["red-cherry"], null, "standard"),
    note("empty", "2026-11-06T10:00:00Z", "V3", [], null),
  ];

  it("counts words, grapes and places, and how each month went", () => {
    const g = growthOf(tastings, vintages);
    expect(g.wines).toBe(3);
    expect(g.words[0]).toEqual({ id: "blackcurrant", n: 2 });
    expect(g.words).toHaveLength(4);
    expect(g.grapes).toEqual([
      { name: "Cabernet Sauvignon", n: 1 },
      { name: "Pinot Noir", n: 1 },
    ]);
    expect(g.regions).toBe(2);
    expect(g.months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    expect(g.months[1]).toMatchObject({
      wines: 2,
      wordsPerWine: 2,
      avgScore: 92,
      newWords: ["cedar", "vanilla", "red-cherry"],
    });
  });

  it("suggests 进阶 after about ten beginner notes", () => {
    const many = Array.from({ length: 10 }, (_, i) => note(`N${i}`, "2026-11-01T00:00:00Z", "V1", [], 90));
    expect(suggestStandard(growthOf(many, vintages), "beginner")).toBe(true);
    expect(suggestStandard(growthOf(many, vintages), "standard")).toBe(false);
    expect(suggestStandard(growthOf(many.slice(1), vintages), "beginner")).toBe(false);
  });
});

describe("分享图", () => {
  const wine: ProseWine = {
    producer: "Ridge",
    wine: "Monte Bello",
    year: 2016,
    color: "red",
    country: "USA",
    region: "California",
    area: null,
    appellation: "Santa Cruz Mountains",
    grapes: ["Cabernet Sauvignon"],
    abv: 13.5,
  };
  const base: ProseTasting = {
    appearance: {},
    nose: {},
    palate: {},
    extra: {},
    descriptors: [],
    quality: null,
    score: 95,
    note: null,
  };

  it("gives the model only what was recorded", () => {
    expect(tastingFacts(base)).toEqual([]);
    const facts = tastingFacts({
      ...base,
      appearance: { intensity: 3, hue: "ruby" },
      descriptors: [
        { id: "blackcurrant", intensity: 3 },
        { id: "nope", intensity: 2 },
      ],
      palate: { tannin: 4, tanninTexture: "fine", finish: 5, finishSeconds: 12 },
      quality: "outstanding",
      note: "像雪松盒子",
    });
    expect(facts.join("\n")).toContain("Appearance: deep, ruby");
    expect(facts.join("\n")).toContain("Aromas: Blackcurrant (prominent)");
    expect(facts.join("\n")).toContain("medium+ tannin (fine-grained)");
    expect(facts.join("\n")).toContain("long finish (about 12 seconds)");
    expect(facts.join("\n")).toContain("«像雪松盒子»");
    expect(facts.join("\n")).not.toContain("95");
    expect(facts.join("\n")).not.toContain("nope");
    expect(wineFacts(wine)).toContain("From: USA > California > Santa Cruz Mountains");
  });

  it("wraps CJK and Latin text without starting a line with a closing mark", () => {
    const measure = (s: string) => s.length;
    expect(wrap(measure, "黑醋栗与雪松，单宁细腻。", 6)).toEqual(["黑醋栗与雪", "松，单宁细", "腻。"]);
    expect(wrap(measure, "Blackcurrant and cedar, fine tannins.", 16)).toEqual([
      "Blackcurrant and",
      "cedar, fine",
      "tannins.",
    ]);
  });
});
