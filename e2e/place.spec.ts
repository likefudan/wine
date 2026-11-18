import { expect, test } from "@playwright/test";

test("the 产区 / 大区 / 子产区 lists show on tap, narrow by what is above, and Oakville fills in Napa Valley", async ({
  page,
}) => {
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

  // Our own list, not <datalist> (which iPhone Safari shows only now and then).
  await page.click('input[name="region"]');
  await page.click(".suggestions >> text=California");
  await expect(page.locator('input[name="region"]')).toHaveValue("California");
  await expect(page.locator('input[placeholder="USA"]')).toHaveValue("USA");

  await page.click('input[name="area"]');
  await expect(page.locator(".suggestions button", { hasText: "Sonoma County" })).toHaveCount(1);
  await expect(page.locator(".suggestions button", { hasText: "Médoc" })).toHaveCount(0);

  await page.click('input[name="appellation"]');
  await expect(page.locator(".suggestions button", { hasText: "Pauillac" })).toHaveCount(0);
  await page.fill('input[name="appellation"]', "oakv");
  await page.click(".suggestions >> text=Oakville");
  await expect(page.locator('input[name="appellation"]')).toHaveValue("Oakville");
  await expect(page.locator('input[name="area"]')).toHaveValue("Napa Valley");
  await page.click("text=开始品鉴");
  await expect(page.locator(".q-ask")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".wine-sub").first()).toContainText("Napa Valley › Oakville");
});
