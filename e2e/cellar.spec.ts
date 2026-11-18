import { expect, test } from "@playwright/test";

// 酒窖: put bottles away, get reminded when they are due, and open one into a note.
test("cellar: add bottles, reminder, open one, take one from a note", async ({ page }) => {
  const year = new Date().getFullYear();
  await page.goto("/");
  await page.fill('input[type="email"]', `cellar${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");

  // The 酒窖 is a view of the 酒库, not a tab of its own.
  await expect(page.locator("nav >> text=酒窖")).toHaveCount(0);
  await page.click("nav >> text=酒库");
  await page.click(".segmented >> text=酒窖");
  await expect(page.locator(".empty")).toContainText("买了酒就放进来");
  await page.click(".library-head >> text=放进酒窖");
  await page.fill("input.search", "Cellar Test Cab");
  await page.click("text=新酒：Cellar Test Cab");
  await page.fill('input[placeholder="2019"]', "2016");
  await page.click(".choice >> text=红");
  await page.click("text=下一步");

  await expect(page).toHaveURL(/\/cellar\/new/);
  await page.click('button[aria-label="多一瓶"]');
  await page.click('button[aria-label="多一瓶"]');
  await expect(page.locator('input[aria-label="瓶数"]')).toHaveValue("3");
  await page.fill('input[name="location"]', "家里酒柜");
  await page.fill('input[aria-label="从哪一年"]', "2020");
  await page.fill('input[aria-label="到哪一年"]', String(year));
  // The button is at the end of the form: scroll it clear of the floating tab bar.
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.click(".button.primary >> text=放进酒窖");
  await expect(page).toHaveURL(/\/cellar\/[0-9A-Z]{26}$/);
  await expect(page.locator(".open-left")).toContainText("3 瓶");

  // Its last year: a dot on the tab and a line on the home page, until the 酒窖 is opened.
  await page.click("nav >> text=品鉴");
  await expect(page.locator(".cellar-alert")).toContainText("3 瓶今年是适饮期最后一年");
  await expect(page.locator('nav a[href="/library"] .dot')).toHaveCount(1);
  await page.click(".cellar-alert");
  await expect(page.locator(".cellar-group.last")).toContainText("Cellar Test Cab");
  await expect(page.locator('nav a[href="/library"] .dot')).toHaveCount(0);
  // 全部 lists it too, bought but not tasted yet.
  await page.click(".segmented >> text=全部");
  await expect(page.locator(".row", { hasText: "Cellar Test Cab" })).toContainText("存 3 瓶");
  await expect(page.locator(".row", { hasText: "Cellar Test Cab" })).toContainText("还没喝");
  await page.click("nav >> text=品鉴");
  await expect(page.locator(".cellar-alert")).toHaveCount(0);

  // 开一瓶 = 记一杯, from the 酒窖 view .
  await page.click("nav >> text=酒库");
  await page.click(".segmented >> text=酒窖");
  await page.click(".row >> text=Cellar Test Cab");
  await page.click("text=开一瓶，记一杯");
  await expect(page).toHaveURL(/\/taste\//);
  await expect(page.locator(".cellar-line")).toContainText("从酒窖开的 · 家里酒柜 · 还剩 2 瓶");
  await page.click("header >> text=完成");
  await expect(page.locator(".cards")).toContainText("从酒窖开的");
  // The wine's page shows what is left, with 开一瓶 right there.
  await expect(page.locator(".wine-cellar")).toContainText("存 2 瓶");

  // 记一杯 elsewhere: "this bottle came from the cellar" takes one off.
  await page.click(".dock-add");
  await page.fill("input.search", "Cellar Test");
  await expect(page.locator(".row", { hasText: "Cellar Test Cab" })).toContainText("酒窖里 2 瓶");
  await page.click(".row >> text=Cellar Test Cab");
  await page.click("text=是，酒窖减一瓶");
  await expect(page.locator(".cellar-line")).toContainText("还剩 1 瓶");
  // Put back by mistake? 放回去.
  await page.click(".cellar-line >> text=放回去");
  await expect(page.locator(".cellar-line")).toContainText("酒窖里还有 2 瓶");
  await page.click("text=是，酒窖减一瓶");
  await page.click("header >> text=完成");

  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/sync").then((r) => r.json()))).cellar?.[0]?.qty, {
      timeout: 40_000,
    })
    .toBe(1);
  const s = await page.evaluate(() => fetch("/api/sync").then((r) => r.json()));
  expect(s.tastings.filter((x: { cellarId: string | null }) => x.cellarId)).toHaveLength(2);

  // From a note on the wine's page: the bottle button opens a sheet to put more in the cellar.
  await page.click("nav >> text=酒库");
  await page.click(".segmented >> text=全部");
  await page.click(".row >> text=Cellar Test Cab");
  await page.locator(".card-action.second").first().click();
  await expect(page.locator(".sheet")).toContainText("在哪买的");
  await page.fill('.sheet input[name="source"]', "K&L Wine Merchants");
  await page.fill(".sheet .price-input input", "95");
  await page.click(".sheet .button.primary >> text=放进酒窖");
  await expect(page.locator(".sheet")).toHaveCount(0);
  await expect(page.locator(".wine-cellar")).toContainText("存 2 瓶");
});
