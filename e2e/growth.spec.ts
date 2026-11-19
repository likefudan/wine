import { expect, test } from "@playwright/test";

// 我的 → 成长: the aromas I have named and how each month went.
test("growth shows the aromas and grapes I have tasted", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `growth${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click('nav >> text="我"');
  await expect(page.locator(".growth, [role=tabpanel]")).toContainText("记几款酒之后");

  await page.click("nav >> text=品鉴");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Growth Winery");
  await page.fill('.sheet input[placeholder^="例如"]', "Growth day");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Growth Cab");
  await page.click("text=新酒：Growth Cab");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click(".grape-picker >> text=赤霞珠");
  await page.click("text=开始品鉴");
  await page.click(".chip >> text=黑醋栗");
  await page.click(".chip >> text=雪松");
  await page.click("header >> text=完成");

  await page.click('nav >> text="我"');
  await expect(page.locator(".stat").first()).toContainText("1");
  await expect(page.locator(".growth-months li")).toHaveCount(1);
  await expect(page.locator(".growth-months")).toContainText("每款平均 2 个香气词");
  await expect(page.locator(".growth-months")).toContainText("新认识：黑醋栗、雪松");
  await expect(page.locator(".growth .chip.static", { hasText: "赤霞珠" })).toHaveCount(1);
});
