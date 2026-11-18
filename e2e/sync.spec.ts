import { expect, test } from "@playwright/test";

// Notes stay on the phone while I tap and go up together at 完成, with no "backing up" bar.
test("tapping through a private note does not upload each change", async ({ page }) => {
  let uploads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ops")) uploads++;
  });
  await page.goto("/");
  await page.fill('input[type="email"]', `sync${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder^="例如"]', "Sonoma");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Kistler Les Noisetiers");
  await page.click("text=新酒：Kistler Les Noisetiers");
  await page.fill('input[placeholder="2019"]', "2021");
  await page.click(".choice >> text=白");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);
  await page.waitForTimeout(1500);
  const before = uploads;

  for (const v of [80, 85, 88, 91]) {
    await page.locator('input[type="range"][aria-label="我的分"]').evaluate((el, n) => {
      const input = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(n));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  expect(uploads).toBe(before);
  await expect(page.locator(".sync-bar")).toHaveCount(0);

  await page.click("header >> text=完成");
  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/sync").then((r) => r.json()))).tastings[0]?.score)
    .toBe(91);
});
