import { expect, test } from "@playwright/test";

// 入门's questions are one way to fill in its Level 2 table: the table can be filled in directly,
// and going through the questions again starts the table afresh.
test("a beginner fills in the table directly, then starts again by the questions", async ({ page }) => {
  page.on("dialog", (d) => {
    throw new Error(`native dialog shown: ${d.message()}`);
  });
  await page.goto("/");
  await page.fill('input[type="email"]', `table${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Table Winery");
  await page.fill('.sheet input[placeholder^="例如"]', "Table day");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Table Red");
  await page.click("text=新酒：Table Red");
  await page.fill('input[placeholder="2019"]', "2020");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");

  // It opens on the table, Level 2's items, with the questions one tap away.
  const table = page.locator(".level-two");
  const on = (label: string) => table.locator(`.choice[aria-label="${label}"] button.on`);
  // Level 2's steps: three for most items, four for sweetness.
  await expect(table.locator('.choice[aria-label="单宁"] button')).toHaveText(["低", "中", "高"]);
  await expect(table.locator('.choice[aria-label="甜度"] button')).toHaveText(["干", "微甜", "中等甜", "甜"]);
  await table.locator('.choice[aria-label="单宁"] >> text=高').click();
  await table.locator('.choice[aria-label="甜度"] >> text=干').click();
  await table.locator('.aroma-family .chip >> text="黑醋栗"').first().click();
  await expect(on("单宁")).toHaveText("高");
  await expect(page.locator(".tasting-note p")).toContainText("高单宁");

  // Answering again asks first, then clears the table and starts at the first question.
  await page.click("text=用问答重新填表");
  await expect(page.locator(".confirm p")).toHaveText("重新回答会清空表格里的内容，从第一题开始。");
  await page.locator(".confirm-actions button", { hasText: "重新回答" }).click();
  await expect(page.locator(".q-ask")).toHaveText("杯里的酒最像哪个颜色？");
  await page.click("text=回到表格");
  await expect(page.locator("text=一题一题帮我填")).toBeVisible();
  await expect(on("单宁")).toHaveCount(0);
  await expect(on("甜度")).toHaveCount(0);
  await expect(table.locator(".aroma-chosen .chip")).toHaveCount(0);
});
