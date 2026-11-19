import { expect, test } from "@playwright/test";

/** A 600×400 PNG, made in the page so the test needs no file on disk. */
async function photo(page: import("@playwright/test").Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 400;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7a1f2b";
    g.fillRect(0, 0, 600, 400);
    g.fillStyle = "#e8c873";
    g.beginPath();
    g.arc(300, 200, 120, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL("image/png").split(",")[1]!;
  });
  return Buffer.from(b64, "base64");
}

// 我的 → tap the card: 昵称 and 头像 (upload, crop, back to none).
test("a person changes their display name and photo", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `profile${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("nav >> text=我的");

  await page.click(".me-card");
  const sheet = page.locator(".sheet");
  await sheet.locator("input:not([type=file])").fill("😀");
  await expect(sheet.locator(".field-hint.bad")).toBeVisible();
  await expect(sheet.locator("button[type=submit]")).toBeDisabled();
  await sheet.locator("input:not([type=file])").fill("Wine Lover");
  await sheet.locator("button[type=submit]").click();
  await expect(sheet.locator("button[type=submit]")).toHaveText("已保存");

  await sheet
    .locator("input[type=file]")
    .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: await photo(page) });
  await expect(page.locator(".crop-frame canvas")).toBeVisible();
  await page.locator(".crop-zoom").fill("2");
  await page.click(".avatar-crop >> text=保存");
  await expect(sheet.locator(".avatar-form img")).toHaveAttribute("src", /^\/api\/avatars\//);
  await page.click(".sheet [aria-label=关闭]");

  await expect(page.locator(".me-card strong")).toHaveText("Wine Lover");
  await expect(page.locator(".app-head .head-avatar img")).toHaveAttribute("src", /^\/api\/avatars\//);

  // Survives a reload (the server's copy), then 不用头像 goes back to the initial.
  await page.reload();
  await expect(page.locator(".me-card strong")).toHaveText("Wine Lover");
  await page.click(".me-card");
  await page.click(".sheet >> text=不用头像");
  await expect(page.locator(".app-head .head-avatar img")).toHaveCount(0);
  await expect(page.locator(".app-head .head-avatar")).toHaveText("W");
});
