import { expect, test } from "@playwright/test";

// Deleting goes through our own confirm box: some iPhone in-app browsers never show window.confirm()
// and answer "no" at once, which made the delete button do nothing there.
test("a tasting is deleted after confirming in the app's own box", async ({ page }) => {
  page.on("dialog", (d) => {
    throw new Error(`native dialog shown: ${d.message()}`);
  });
  await page.goto("/");
  await page.fill('input[type="email"]', `delete${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Opus One");
  await page.fill('.sheet input[placeholder^="例如"]', "Napa");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  // Its own wine: the shared catalogue keeps the first version of a wine, and the other tests add
  // Opus One with its grapes.
  await page.fill("input.search", "Ridge Monte Bello");
  await page.click("text=新酒：Ridge Monte Bello");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);

  // 取消 keeps it.
  await page.locator("text=删除这条记录").tap();
  await expect(page.locator(".confirm p")).toHaveText("删除这条品鉴记录？");
  await page.locator(".confirm >> text=取消").tap();
  await expect(page.locator(".confirm")).toHaveCount(0);
  await expect(page).toHaveURL(/\/taste\//);

  await page.locator("text=删除这条记录").tap();
  await page.locator(".confirm-actions .danger").tap();
  await expect(page).toHaveURL(/\/lists\//);
  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/sync").then((r) => r.json()))).tastings.length)
    .toBe(0);
});
