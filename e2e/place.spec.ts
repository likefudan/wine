import { expect, test } from "@playwright/test";

test("picking California narrows the 子产区 list, and Oakville fills in Napa Valley", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `place${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder^="例如"]', "Napa");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Far Niente");
  await page.click("text=新酒：Far Niente");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");

  await page.fill('input[list="region-list"]', "California");
  await expect(page.locator("#appellation-list option[value='Oakville']")).toHaveCount(1);
  await expect(page.locator("#appellation-list option[value='Pauillac']")).toHaveCount(0);
  await expect(page.locator("#area-list option[value='Sonoma County']")).toHaveCount(1);

  await page.fill('input[list="appellation-list"]', "Oakville");
  await expect(page.locator('input[list="area-list"]')).toHaveValue("Napa Valley");
  await expect(page.locator('input[placeholder="USA"]')).toHaveValue("USA");
  await page.click("text=开始品鉴");
  await expect(page.locator(".q-ask")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".wine-sub").first()).toContainText("Napa Valley › Oakville");
});
