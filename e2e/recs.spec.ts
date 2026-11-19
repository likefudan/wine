import { expect, test } from "@playwright/test";
import { ulid } from "../src/shared/model";

// 推荐: 今晚开哪瓶 from the cellar, 下一款试试 / 进阶一款, and 我的 → 口味.
test("recommendations: tonight's bottle, taste profile and a step further", async ({ page }) => {
  const year = new Date().getFullYear();
  await page.goto("/");
  await page.fill('input[type="email"]', `recs${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await expect(page.locator("nav")).toBeVisible();

  // Four Napa Cabernets I loved, two Pinots I did not, and two lots in the cellar.
  const at = new Date().toISOString();
  const wine = (producer: string, grape: string, region: string, area: string) => ({
    op: "putVintage",
    id: ulid(),
    producer,
    wine: "Reserve",
    year: 2018,
    color: "red",
    country: region === "Burgundy" ? "France" : "USA",
    region,
    area,
    grapes: [grape],
  });
  const cabs = ["Alpha", "Beta", "Gamma", "Delta"].map((p) =>
    wine(`${p} Cellars`, "Cabernet Sauvignon", "California", "Napa Valley"),
  );
  const pinots = ["Epsilon", "Zeta"].map((p) => wine(`Domaine ${p}`, "Pinot Noir", "Burgundy", "Côte de Nuits"));
  const note = (vintageId: string, score: number) => ({
    op: "putTasting",
    tasting: {
      id: ulid(),
      vintageId,
      listItemId: null,
      tastedAt: at,
      depth: "quick",
      appearance: {},
      nose: {},
      palate: { tannin: score > 90 ? 5 : 2 },
      extra: {},
      guesses: {},
      descriptors: [],
      quality: null,
      score,
      buyAgain: null,
      boughtQty: null,
      priceUsd: null,
      note: null,
      photoId: null,
      updatedAt: at,
    },
  });
  const cellarWine = wine("Omega Estate", "Cabernet Sauvignon", "California", "Napa Valley");
  const oldWine = wine("Old Vine Cellars", "Cabernet Sauvignon", "California", "Sonoma County");
  const lot = (vintageId: string, drinkTo: number) => ({
    op: "putCellar",
    lot: {
      id: ulid(),
      vintageId,
      qty: 3,
      sizeMl: 750,
      location: "家里酒柜",
      boughtOn: null,
      price: null,
      currency: null,
      source: null,
      drinkFrom: 2015,
      drinkTo,
      note: null,
      createdAt: at,
      updatedAt: at,
    },
  });
  const ops = [
    ...cabs,
    ...pinots,
    cellarWine,
    oldWine,
    ...cabs.map((v) => note(v.id, 95)),
    ...pinots.map((v) => note(v.id, 84)),
    lot(cellarWine.id, year + 8),
    lot(oldWine.id, year - 1),
  ];
  const res = await page.evaluate(
    (body) =>
      fetch("/api/ops", { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) =>
        r.json(),
      ),
    JSON.stringify({ ops }),
  );
  expect((res as { results: { ok: boolean }[] }).results.every((r) => r.ok)).toBe(true);
  await page.reload();

  // Home: the 酒窖提醒 line comes first; once seen, tonight's bottle (the one past its window) takes its place.
  await expect(page.locator(".cellar-alert")).toBeVisible();
  await expect(page.locator(".recs-home")).toHaveCount(0);
  await page.goto("/library?view=cellar");
  await page.click("nav >> text=品鉴");
  await expect(page.locator(".recs-home")).toContainText("Old Vine Cellars");
  await page.goto("/library?view=cellar");
  await page.click(".cellar-recs");
  await expect(page).toHaveURL(/\/recs$/);
  await expect(page.locator(".recs")).toContainText("根据你打过分的 6 款酒");
  const first = page.locator(".rec-list").first().locator(".rec-card").first();
  await expect(first).toContainText("Old Vine Cellars");
  await expect(first).toContainText("已过适饮期，别再等了");
  // Something rich: still a red; the Napa Cab I'd like comes first among the in-window ones.
  await page.click(".chip >> text=浓郁一点");
  await expect(page.locator(".rec-card", { hasText: "Omega Estate" })).toContainText("你给赤霞珠的酒平均 95 分");

  // A step further from Cabernet: Cabernet Franc, with words for beginners.
  await expect(page.locator(".stretch")).toContainText("品丽珠");
  await expect(page.locator(".stretch")).toContainText("从你喜欢的赤霞珠往前走一步");
  await page.click(".stretch >> text=换一个");
  await expect(page.locator(".stretch")).toContainText("马尔贝克");

  // Open a bottle from here: one fewer, and a note starts.
  await page.locator(".rec-card", { hasText: "Old Vine Cellars" }).locator("text=开一瓶，品一款").click();
  await expect(page).toHaveURL(/\/taste\/[0-9A-Z]{26}/);

  // 我的 → 口味
  await page.goto("/me?tab=taste");
  await expect(page.locator(".taste-features").first()).toContainText("赤霞珠");
  await expect(page.locator(".taste-features").first()).toContainText("+");
  await expect(page.locator("[role=tabpanel]")).toContainText("不太对你胃口");
  await expect(page.locator("[role=tabpanel]")).toContainText("单宁重");
});
