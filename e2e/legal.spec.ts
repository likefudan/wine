import { expect, test } from "@playwright/test";

// 隐私政策 and 服务条款 are open to anyone: Google's sign-in review reads them without an account.
test("the sign-in page says what the app is and links to the policy and terms", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".login .lead")).toBeVisible();
  await expect(page.locator(".login-features li")).toHaveCount(4);

  await page.click(".legal-links >> text=隐私政策");
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("h1")).toHaveText("隐私政策");
  await expect(page.locator(".legal")).toContainText("来自 Google 的信息");
  await expect(page.locator(".legal")).toContainText("localhost:8788");
  await expect(page.locator(".legal")).not.toContainText("{site}");

  // In the other two languages too.
  await page.click('.lang-switch >> text="EN"');
  await expect(page.locator("h1")).toHaveText("Privacy Policy");
  await expect(page.locator(".legal")).toContainText("Limited Use requirements");
  await page.click('.lang-switch >> text="繁"');
  await expect(page.locator("h1")).toHaveText("隱私權政策");
  await page.click('.lang-switch >> text="简"');

  await page.click(".legal-links >> text=服务条款");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.locator("h1")).toHaveText("服务条款");
  // The name at the top goes back to the sign-in page.
  await page.click(".legal-top .app-brand");
  await expect(page.locator(".login")).toBeVisible();
});

test("opened directly, and from 我 when signed in", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.locator("h1")).toHaveText("服务条款");

  await page.goto("/");
  await page.fill('input[type="email"]', `legal${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.goto("/me?tab=settings");
  await page.click(".legal-links >> text=隐私政策");
  await expect(page.locator("h1")).toHaveText("隐私政策");
  // Signed in, the app's own top bar and tabs are there instead of the page's.
  await expect(page.locator(".legal-top")).toHaveCount(0);
  await expect(page.locator(".tabbar a.on")).toContainText("我");
});

test("signed in, the policy has a way back to 我", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `legalback${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.goto("/me?tab=settings");
  await page.click(".legal-links >> text=服务条款");
  await page.click('header button[aria-label="返回"]');
  await expect(page).toHaveURL(/\/me\?tab=settings/);
});
