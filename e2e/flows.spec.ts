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
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Opus One");
  await page.fill('.sheet input[placeholder^="例如"]', "Napa day 1");
  await page.click("text=建好了");
  await expect(page.locator(".page-head .place-link")).toContainText("Opus One");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Opus One");
  await page.click("text=新酒：Opus One");
  await page.fill('input[placeholder="2019"]', "2019");
  await page.click(".choice >> text=红");
  // Grapes are tapped, not typed: two common ones, one from the longer list.
  await page.click(".grape-picker >> text=赤霞珠");
  await page.click(".grape-picker >> text=梅洛");
  await page.selectOption(".grape-more select", "Cabernet Franc");
  await expect(page.locator(".grape-picker .chip.on")).toHaveText(["赤霞珠", "梅洛", "品丽珠"]);
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
  await expect(page.locator(".rows .row .wine-sub")).toContainText("赤霞珠 / 梅洛 / 品丽珠");
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
  await page.goto("/me?tab=general");
  await page.click(".lang-switch >> text=EN");
  await expect(page.locator("h1")).toHaveText("Me");
  await page.goto("/");
  await expect(page.locator("text=New tasting")).toBeVisible();
});

test("the Google button leaves the app for the sign-in route", async ({ page }) => {
  await page.goto("/");
  await page.click("text=用 Google 登录");
  // Google is not set up on the test site, so the Worker sends the page back with this error; the
  // client router must not swallow the click.
  await expect(page).toHaveURL(/\/login\?error=not_configured/);
});

/** Sets a range input the way a finger would, so Preact's onInput sees it. */
async function slide(page: Page, label: string, value: number) {
  await page.locator(`input[type="range"][aria-label="${label}"]`).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(v));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("a friend scans the Napa list's QR code, joins, and sees the scores only after handing in", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  owner.on("dialog", (d) => d.accept());
  await signIn(owner);
  await owner.click("text=只想快速记个分");
  await owner.click("text=新建品鉴");
  await owner.fill('.sheet input[placeholder^="例如"]', "Napa 第一天");
  await owner.click("text=建好了");
  for (const [wine, year] of [
    ["Caymus Vineyards", "2021"],
    ["Silver Oak Napa Valley", "2019"],
  ] as const) {
    await owner.click("text=加下一款酒");
    await owner.fill("input.search", wine);
    await owner.click(`text=新酒：${wine}`);
    await owner.fill('input[placeholder="2019"]', year);
    await owner.click(".choice >> text=红");
    await owner.click("text=开始品鉴");
    await slide(owner, "我的分", wine.startsWith("Caymus") ? 90 : 94);
    await owner.click("header >> text=完成");
  }
  await expect(owner.locator(".rows.numbered .row")).toHaveCount(2);
  await expect
    .poll(() =>
      owner.evaluate(() =>
        fetch("/api/sync")
          .then((r) => r.json())
          .then((d) => d.tastings.length),
      ),
    )
    .toBe(2);

  await owner.click("header >> text=分享");
  await expect(owner.locator(".sheet img.qr")).toBeVisible();
  const listId = owner.url().split("/lists/")[1]!;
  const key = (await owner.evaluate((id) => fetch(`/api/lists/${id}/board`).then((r) => r.json()), listId)).key;
  const link = `/l/${listId}?k=${key}`;

  // The friend scans it, signed out: the wines, no scores, and a sign-in button.
  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await friend.goto(link);
  await expect(friend.locator("h1.list-title")).toHaveText("Napa 第一天");
  await expect(friend.locator(".rows .row")).toHaveCount(2);
  await expect(friend.locator(".row-score")).toHaveCount(0);
  await friend.click("text=用 Google 登录并加入");
  // No Google on the test site: sign in by email instead; the app finishes joining afterwards.
  await friend.fill('input[type="email"]', `friend${Date.now()}@example.com`);
  await friend.click("text=Dev login");
  await expect(friend).toHaveURL(new RegExp(`/lists/${listId}$`));
  await expect(friend.locator(".rows.numbered .row")).toHaveCount(2);
  // 盲评: only how many rated it.
  await expect(friend.locator(".everyone-chip").first()).toHaveText("🔒 1 人已评");

  // A friend new to the site starts at 入门: one plain question at a time.
  await friend.locator(".rows.numbered .row").first().click();
  await expect(friend.locator(".q-ask")).toHaveText("杯里的酒最像哪个颜色？");
  await friend.click(".depth-tabs >> text=快记");
  await slide(friend, "我的分", 86);
  await friend.click("header >> text=完成");
  await expect(friend.locator(".everyone-chip").first()).toHaveText("大家 2 人 · 平均 88");
  await expect(friend.locator(".everyone-chip").nth(1)).toHaveText("🔒 1 人已评");
  await friend.locator(".everyone-chip").first().click();
  await expect(friend.locator(".sheet .note")).toHaveCount(2);
  await expect(friend.locator(".sheet .note.mine .row-score")).toHaveText("86");

  // The owner sees the friend joined, and reveals everything.
  await owner.reload();
  await owner.click("header >> text=分享");
  await expect(owner.locator(".sheet .members li")).toHaveCount(2);
  await owner.click("text=揭晓：让大家都看到所有评分");
  await expect(owner.locator(".sheet")).toContainText("已揭晓");
  await owner.click("text=品鉴卡片");
  await expect(owner.locator("img.list-card-img")).toBeVisible();

  await friend.reload();
  await expect(friend.locator(".everyone-chip").nth(1)).toHaveText("大家 1 人 · 平均 94");
  await ownerCtx.close();
  await friendCtx.close();
});

test("choosing an aroma lights it up in place without moving the words around it", async ({ page }) => {
  await signIn(page);
  await page.click("text=刚开始认真喝，想学怎么品");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder="Opus One"]', "Calon Segur");
  await page.fill('.sheet input[placeholder^="例如"]', "Aromas");
  await page.click("text=建好了");
  await page.click("text=加下一款酒");
  await page.fill("input.search", "Calon Segur");
  await page.click("text=新酒：Calon Segur");
  await page.fill('input[placeholder="2019"]', "2022");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await page.click(".depth-tabs >> text=进阶");

  const [nose, palate] = [page.locator(".aroma-picker").nth(0), page.locator(".aroma-picker").nth(1)];
  const raspberry = nose.locator(".aroma-family .chip >> text=覆盆子");
  const plum = nose.locator(".aroma-family .chip >> text=红李子");
  // Page coordinates, not viewport ones: the tap may scroll the chip into view.
  const where = () => plum.evaluate((e) => [e.getBoundingClientRect().left, e.getBoundingClientRect().top + scrollY]);
  const before = await where();
  await raspberry.click();
  await expect(raspberry).toHaveAttribute("aria-pressed", "true");
  expect(await where()).toEqual(before);
  await expect(nose.locator(".family-name", { hasText: "红色水果" }).locator(".family-count")).toHaveText("1");
  await expect(nose.locator(".aroma-chosen .chip")).toHaveText([/^覆盆子/]);
  await plum.click();
  await expect(nose.locator(".aroma-chosen .chip")).toHaveText([/^覆盆子/, /^红李子/]);
  // 进阶 taps cycle the strength in place; the third tap takes it out.
  await raspberry.click();
  await expect(raspberry.locator(".dots")).toHaveText("•••");
  expect(await where()).toEqual(before);
  await raspberry.click();
  await expect(raspberry).toHaveAttribute("aria-pressed", "false");
  await expect(nose.locator(".aroma-chosen .chip")).toHaveText([/^红李子/]);

  // The palate's flavours use the same words, and can start from what the nose found.
  await page.click("text=和闻到的一样");
  await expect(palate.locator(".aroma-chosen .chip")).toHaveText(["红李子"]);
  await palate.locator(".aroma-family .chip >> text=黑樱桃").click();
  await expect(palate.locator(".aroma-chosen .chip")).toHaveText(["红李子", "黑樱桃"]);
  await expect(page.locator(".tasting-note p")).toContainText("口中有红李子和黑樱桃");
});

test("adding a wine from inside a list puts it in that list, with no other choice", async ({ page }) => {
  await signIn(page);
  await page.click("text=只想快速记个分");
  await page.click("text=新建品鉴");
  await page.fill('.sheet input[placeholder^="例如"]', "Friday at home");
  await page.click("text=建好了");
  for (const open of ["text=加下一款酒", ".dock-add"]) {
    await page.click(open);
    await expect(page.locator(".add-to-list")).toContainText("Friday at home");
    await expect(page.locator("text=不属于任何品鉴")).toHaveCount(0);
    await page.goBack();
  }
  // From the tab bar outside a list, the choice is still there.
  await page.goto("/");
  await page.click(".dock-add");
  await expect(page.locator("text=不属于任何品鉴")).toBeVisible();
});
