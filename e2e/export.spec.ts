import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// 导出: CSV from the phone's own copy, one row per note, headers in the page's language.
test("exports my notes as CSV and JSON", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `export${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Export test");
  await page.fill('.sheet input[placeholder^="例如"]', "Sonoma");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Export Cellars Zin");
  await page.click("text=新酒：Export Cellars Zin");
  await page.fill('input[placeholder="2019"]', "2021");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);

  await page.goto("/me?tab=general");
  const [csv] = await Promise.all([page.waitForEvent("download"), page.click("text=导出 CSV")]);
  expect(csv.suggestedFilename()).toMatch(/^wine-journal-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await csv.path())!, "utf8");
  expect(text).toContain("日期,酒庄,酒名");
  expect(text).toContain("Export Cellars");
  expect(text).toContain("Sonoma");

  const [json] = await Promise.all([page.waitForEvent("download"), page.click("text=导出 JSON")]);
  const back = JSON.parse(readFileSync((await json.path())!, "utf8"));
  expect(back.tastings).toHaveLength(1);
});
