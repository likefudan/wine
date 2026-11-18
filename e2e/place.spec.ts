import { expect, test } from "@playwright/test";

test("picking Oakville fills California and shows Napa Valley between them", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `place${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建酒单");
  await page.fill('.sheet input[placeholder^="例如"]', "Napa");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Far Niente");
  await page.click("text=新酒：Far Niente");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");
  await page.fill('input[placeholder="Pauillac / Oakville"]', "Oakville");
  await expect(page.locator('input[placeholder="Bordeaux / California"]')).toHaveValue("California");
  await expect(page.locator('input[placeholder="USA"]')).toHaveValue("USA");
  await expect(page.locator(".field-hint", { hasText: "属于 Napa Valley" })).toBeVisible();
  await page.click("text=开始品鉴");
  await expect(page.locator(".q-ask")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".wine-sub").first()).toContainText("Napa Valley › Oakville");
});
