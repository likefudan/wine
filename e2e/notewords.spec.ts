import { expect, test } from "@playwright/test";

// 自由文字转香气标签: words in 一句话 are offered as tags, one tap adds them.
test("turns aroma words in the note into tags", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `words${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Words test");
  await page.fill('.sheet input[placeholder^="例如"]', "Paso");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Note Words Cab");
  await page.click("text=新酒：Note Words Cab");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);

  await page.fill("textarea", "很多黑樱桃和雪茄盒，没有玫瑰");
  await expect(page.locator(".chip.suggest")).toHaveText(["+ 黑樱桃", "+ 雪茄盒"]);
  await page.click("text=全部加上");
  await expect(page.locator(".chip.suggest")).toHaveCount(0);
  await expect(page.locator(".chip.on", { hasText: "黑樱桃" })).toHaveCount(1);
  await expect(page.locator(".chip.on", { hasText: "雪茄盒" })).toHaveCount(1);
});
