import { expect, test } from "@playwright/test";

// The open diary (src/web/book.tsx): on a wide screen the list keeps the left page and what is
// picked from it opens on the right. An iPhone 16 Pro Max on its side is 956 × 440.
test.describe("a phone on its side", () => {
  test.use({ viewport: { width: 956, height: 440 } });

  test("two pages: 品鉴 on the left, its wines on the right, then the note beside the list", async ({ page }) => {
    await page.goto("/");
    await page.fill('input[type="email"]', `book${Date.now()}@example.com`);
    await page.click("text=Dev login");
    await page.click("text=刚开始认真喝，想学怎么品");
    const left = page.locator(".leaf.left");
    const right = page.locator(".leaf.right");
    await expect(page.locator(".spine")).toBeVisible();
    await expect(left.locator(".tabbar")).toBeVisible();
    // Nothing yet: the right page says what will be written on it.
    await expect(right.locator(".blank-page")).toBeVisible();

    // The sheet opened from the left page stays on the left page.
    await left.getByText("新建品鉴").click();
    const sheet = page.locator(".sheet");
    await sheet.locator('input[placeholder^="例如"]').fill("Book day");
    const box = (await sheet.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(956 / 2 + 1);
    await page.click("text=建好了");

    // The new 品鉴 is marked on the left and open on the right.
    await expect(page).toHaveURL(/\/lists\//);
    await expect(left.locator(".cards .selected")).toContainText("Book day");
    await expect(right.locator("h1")).toHaveText("Book day");

    await right.getByText("加下一款酒").click();
    await page.fill("input.search", "Spine Winery");
    await page.click("text=新酒：Spine Winery");
    await page.fill('input[placeholder="2019"]', "2020");
    await page.click(".choice >> text=红");
    await page.click("text=开始品鉴");

    // Noting a glass: the 品鉴's wines move to the left page, this one marked; the form is on the right.
    await expect(page).toHaveURL(/\/taste\//);
    await expect(left.locator("h1")).toHaveText("Book day");
    await expect(left.locator(".rows .selected")).toContainText("Spine Winery");
    await expect(right.locator(".depth-tabs")).toBeVisible();
    // Neither page makes the window scroll; each scrolls by itself.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);

    await right.locator("header >> text=完成").click();
    await expect(page).toHaveURL(/\/lists\//);

    // 酒库: the wines on the left, the one tasted last open on the right; 我的: sections left, the chosen one right.
    await left.locator(".tabbar >> text=酒册").click();
    await expect(left.locator(".rows .selected")).toContainText("Spine Winery");
    await expect(right.locator(".page-head")).toContainText("Spine Winery");
    await left.locator('.tabbar >> text="我"').click();
    await left.locator(".segmented >> text=设置").click();
    await expect(right).toContainText("外观");
    await expect(left.locator(".me-card")).toBeVisible();
  });
});

test("an upright phone keeps its one page", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `page${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await expect(page.locator(".tabbar")).toBeVisible();
  await expect(page.locator(".leaf.left")).toHaveCount(0);
  await expect(page.locator(".spine")).toBeHidden();
});

test("turning the phone on its side opens the book, with 品鉴 on the left only", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `turn${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder^="例如"]', "Turn day");
  await page.click("text=建好了");
  await page.goto("/");
  await expect(page.locator(".list-card")).toHaveCount(1);

  await page.setViewportSize({ width: 956, height: 440 });
  // The list of 品鉴 is on the left; the right page is the newest one, not the list again.
  await expect(page.locator(".leaf.left .list-card")).toHaveCount(1);
  await expect(page.locator(".leaf.right .list-card")).toHaveCount(0);
  await expect(page.locator(".leaf.right h1")).toHaveText("Turn day");

  // And upright again: one page, the list.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".list-card")).toHaveCount(1);
  await expect(page.locator(".leaf.left")).toHaveCount(0);
});
