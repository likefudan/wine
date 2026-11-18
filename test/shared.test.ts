import { describe, expect, it } from "vitest";
import { avaOf } from "../src/shared/ava";
import { placePath, tidyPlace } from "../src/shared/place";
import { BEGINNER_GROUPS, DESCRIPTORS, FAMILIES } from "../src/shared/descriptors";
import { GRAPES, canonicalGrape, commonGrapes, grapeName } from "../src/shared/grapes";
import { beginnerQuestions, glassColor, huesFor, tastingNote } from "../src/shared/guide";
import { COLORS, ID_RE, nameKey, ulid } from "../src/shared/model";

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
  it("knows the AVA each one sits in, and its state", () => {
    expect(avaOf("oakville")).toEqual({ name: "Oakville", parent: "Napa Valley", state: "California", states: ["CA"] });
    expect(avaOf("Napa Valley")?.parent).toBe("");
    expect(avaOf("Eola-Amity Hills")?.parent).toBe("Willamette Valley");
    expect(avaOf("Los Carneros")?.parent).toBe("");
    expect(avaOf("Columbia Valley")?.state).toBe("");
    expect(avaOf("Bordeaux")).toBeNull();
  });
});

describe("产区 levels", () => {
  const tidy = (country: string | null, region: string | null, appellation: string | null) =>
    tidyPlace({ country, region, appellation });

  it("puts Napa Valley and Pauillac at the same level", () => {
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
    expect(placePath({ region: "Bordeaux", appellation: "Bordeaux" })).toEqual(["Bordeaux"]);
    expect(placePath({ region: null, appellation: null })).toEqual([]);
  });

  it("finds appellations spelt without accents, as LWIN does", () => {
    expect(placePath({ region: "Bordeaux", appellation: "Saint-Emilion Grand Cru" })[1]).toBe("Rive Droite");
    expect(placePath({ region: "Bordeaux", appellation: "Moulis en Medoc" })[1]).toBe("Médoc");
    expect(placePath({ region: "Rhone", appellation: "Cote Rotie" })[1]).toBe("Northern Rhône");
  });

  it("moves an AVA typed as the 产区 down a level, and keeps what was typed", () => {
    expect(tidy("", "Napa Valley", "Oakville")).toEqual({
      country: "USA",
      region: "California",
      appellation: "Oakville",
    });
    expect(tidy(null, "Napa Valley", null)).toEqual({
      country: "USA",
      region: "California",
      appellation: "Napa Valley",
    });
    expect(tidy("France", "Médoc", "Pauillac")).toEqual({
      country: "France",
      region: "Bordeaux",
      appellation: "Pauillac",
    });
    // Sonoma Coast is not in Napa Valley: nothing is thrown away.
    expect(tidy("USA", "Napa Valley", "Sonoma Coast")).toEqual({
      country: "USA",
      region: "Napa Valley",
      appellation: "Sonoma Coast",
    });
  });

  it("fills the big region and country from the appellation", () => {
    expect(tidy(null, null, "Oakville")).toEqual({ country: "USA", region: "California", appellation: "Oakville" });
    expect(tidy(null, null, "Pauillac")).toEqual({ country: "France", region: "Bordeaux", appellation: "Pauillac" });
    expect(tidy("United States", "California", "Oakville").country).toBe("USA");
    expect(tidy("Italy", "Tuscany", "Bolgheri")).toEqual({
      country: "Italy",
      region: "Tuscany",
      appellation: "Bolgheri",
    });
    expect(tidy(null, null, null)).toEqual({ country: null, region: null, appellation: null });
  });
});
