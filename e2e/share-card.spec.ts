import { expect, test } from "@playwright/test";

// 分享图: a tasting becomes a picture, with its note editable. Here AI is off, so the note falls back
// to the words in the record.
test("a tasting makes a share image whose text can be edited", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `share${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Opus One");
  await page.fill('.sheet input[placeholder^="例如"]', "Napa");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Ridge Lytton Springs");
  await page.click("text=新酒：Ridge Lytton Springs");
  await page.fill('input[placeholder="2019"]', "2018");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);
  await page.fill("textarea", "黑莓和胡椒，很好喝");

  await page.click("text=生成分享图");
  const text = page.locator(".share-card textarea");
  await expect(text).toHaveValue(/黑莓和胡椒/);
  const img = page.locator(".share-card img");
  await expect(img).toHaveAttribute("src", /^data:image\/png/);
  const before = await img.getAttribute("src");
  // Latin text: the CI runner may have no CJK font, which would draw both notes as nothing.
  await text.fill("A note I rewrote myself.");
  await expect.poll(() => img.getAttribute("src")).not.toBe(before);
  await page.click(".share-card-opts >> text=深色");
  await page.click(".share-card-opts >> text=9:16");
  await expect.poll(async () => await img.evaluate((e: HTMLImageElement) => e.naturalHeight)).toBe(1920);
});

test("the share image can carry a drawn label or a photo taken later", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `label${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Opus One");
  await page.fill('.sheet input[placeholder^="例如"]', "Napa");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Ridge Geyserville");
  await page.click("text=新酒：Ridge Geyserville");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await page.click("text=生成分享图");
  const img = page.locator(".share-card img");
  await expect(img).toHaveAttribute("src", /^data:image\/png/);

  const shown = () => img.getAttribute("src");
  let before = await shown();
  await page.click(".share-card >> text=经典");
  await expect.poll(shown).not.toBe(before);
  before = await shown();
  await page.click(".share-card >> text=现代");
  await expect.poll(shown).not.toBe(before);

  // A photo taken now: the card uses it even though this test site keeps no photos.
  before = await shown();
  const chooser = page.waitForEvent("filechooser");
  await page.click(".share-card >> text=照片");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 400;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#6d1a2a";
    ctx.fillRect(0, 0, 300, 400);
    ctx.fillStyle = "#f7efdc";
    ctx.fillRect(40, 120, 220, 160);
    return c.toDataURL("image/png").split(",")[1]!;
  });
  await (await chooser).setFiles({ name: "label.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await expect.poll(shown).not.toBe(before);
  await expect(page.locator(".share-card")).toContainText("照片存储还没有开通");
});
