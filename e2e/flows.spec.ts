import { type Page, expect, test } from "@playwright/test";

let n = 0;
async function signIn(page: Page) {
  await page.goto("/");
  await page.fill('input[type="email"]', `taster${Date.now()}-${n++}@example.com`);
  await page.click("text=Dev login");
}

test("a beginner records a wine in a list and finds it in the library", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await signIn(page);
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建酒单");
  await page.fill(".sheet input", "Napa day 1");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Opus One");
  await page.click("text=新酒：Opus One");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");

  // 入门: plain questions, one at a time.
  await expect(page.locator(".q-ask")).toHaveText("杯里的酒最像哪个颜色？");
  await page.click(".hue >> nth=1");
  await page.click(".choice >> text=深");
  await page.click("text=下一题");
  await page.click("text=正常，一闻就有");
  await page.click(".answer >> text=水果");
  await page.click("text=黑色、紫色的果子");
  await page.click(".answer >> text=黑醋栗");
  await page.click("text=下一题");
  await page.click("text=完全不甜，像无糖茶");
  await page.click("text=流一点");
  await page.click("text=很干，像咬了一口没熟的柿子");
  await page.click(".answer >> text=全脂奶");
  await page.click("text=有一点暖");
  await page.click("text=很久，十几秒以上");
  await expect(page.locator(".tasting-note p")).toHaveText(
    "深宝石红，黑醋栗香气，高单宁，中酸度，酒体中等，中酒精，余味长",
  );

  // Switching depth keeps the answers.
  await page.click(".depth-tabs >> text=进阶");
  await expect(page.locator('.choice[aria-label="单宁"] button.on')).toHaveText("高");
  await page.click("header >> text=完成");
  await expect(page.locator(".rows.numbered .row")).toHaveCount(1);

  await page.click(".tabbar >> text=酒库");
  await page.fill("input.search", "黑醋栗");
  await expect(page.locator(".rows .row")).toHaveCount(1);
  await page.fill("input.search", "cassis nothing");
  await expect(page.locator(".rows .row")).toHaveCount(0);

  // Everything reached the server.
  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/sync").then((r) => r.json()))).tastings.length)
    .toBe(1);
});

test("the pages switch to English", async ({ page }) => {
  await signIn(page);
  await page.click("text=只想快速记个分");
  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/auth/session").then((r) => r.json()))).me.depth)
    .toBe("quick");
  await page.goto("/me");
  await page.click(".lang-switch >> text=EN");
  await expect(page.locator("h1")).toHaveText("Me");
  await page.goto("/");
  await expect(page.locator("text=New list")).toBeVisible();
});
