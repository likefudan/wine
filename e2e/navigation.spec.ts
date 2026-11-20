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

test("返回 goes to the page a page was opened from, one step each time, and never out of the app", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `back${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  const back = 'header button[aria-label="返回"]';
  await page.click(".dock-add");
  await page.fill("input.search", "Back Winery");
  await page.click("text=新酒：Back Winery");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await page.click("header >> text=完成");
  await expect(page).toHaveURL(/:8788\/$/);

  // 酒册 → the wine → its note → 返回 → the wine → 返回 → 酒册: the wine is not gone through twice.
  await page.click(".tabbar >> text=酒册");
  await page.click(".rows .row >> text=Back Winery");
  await expect(page).toHaveURL(/\/wine\//);
  await page.locator('a.card[href^="/taste/"]').first().click();
  await page.click(back);
  await expect(page).toHaveURL(/\/wine\//);
  await page.click(back);
  await expect(page).toHaveURL(/\/library/);

  // A page opened by its address has nothing behind it: 返回 goes to the page above, not away.
  const wine = await page
    .locator(".rows .row >> text=Back Winery")
    .evaluate((e) => e.closest("a")!.getAttribute("href"));
  const fresh = await page.context().newPage();
  await fresh.goto(wine!);
  await fresh.click(back);
  await expect(fresh).toHaveURL(/\/library/);
  await fresh.goto("/add");
  await fresh.click(back);
  await expect(fresh).toHaveURL(/:8788\/$/);
});
