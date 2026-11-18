import { expect, test } from "@playwright/test";

test("a new page opens at its top; an empty note is not ticked; 推荐 sits under 品鉴", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `nav${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder^="例如"]', "Scroll day");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Scroll Winery");
  await page.click("text=新酒：Scroll Winery");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => scrollY)).toBe(0);

  // Nothing written yet: the wine in the list is not ticked off.
  await page.click("header >> text=完成");
  await expect(page.locator(".rows.numbered .row .row-score")).toHaveText("记");

  // 为你推荐 belongs under 品鉴 in the tab bar.
  await page.goto("/recs");
  await expect(page.locator(".tabbar a.on")).toContainText("品鉴");
});
