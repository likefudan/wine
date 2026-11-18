import { describe, expect, it } from "vitest";
import { BEGINNER_GROUPS, DESCRIPTORS, FAMILIES } from "../src/shared/descriptors";
import { canonicalGrape, grapeName } from "../src/shared/grapes";
import { beginnerQuestions, glassColor, tastingNote } from "../src/shared/guide";
import { ID_RE, nameKey, ulid } from "../src/shared/model";

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
  });

  it("gives a glass colour without an appearance", () => {
    expect(glassColor("red", undefined, new Date().getFullYear())).toMatch(/^#/);
    expect(glassColor("white", { hue: "gold", intensity: 3 })).toBe("#c9952f");
  });
});
