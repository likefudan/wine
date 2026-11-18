import { type Page, expect, test } from "@playwright/test";

// 盲品: taste without the wine's name, guess, then fill in the answer and see the score.
let n = 0;
async function signIn(page: Page, who = "blind") {
  await page.goto("/");
  await page.fill('input[type="email"]', `${who}${Date.now()}-${n++}@example.com`);
  await page.click("text=Dev login");
}
const shot = (page: Page, name: string) =>
  process.env.BLIND_SHOTS ? page.screenshot({ path: `${process.env.BLIND_SHOTS}/${name}.png`, fullPage: true }) : null;

/** 猜一猜 on the open tasting page: Cabernet, France · Bordeaux, 2016. */
async function guess(page: Page) {
  const card = page.locator(".guess-card");
  await card.locator(".chip", { hasText: "赤霞珠" }).click();
  await card.locator(".chip", { hasText: "法国" }).click();
  await card.locator(".chip", { hasText: "波尔多" }).click();
  await card.locator('input[inputmode="numeric"]').fill("2016");
}

/** 对答案 on the add page: a new wine typed in by hand. */
async function answer(page: Page, wine: string, year: string) {
  await expect(page.locator(".page-head-title")).toHaveText("对答案");
  await page.fill("input.search", wine);
  await page.click(`text=新酒：${wine}`);
  await page.fill('input[placeholder="2019"]', year);
  await page.click(".choice >> text=红");
  await page.click("text=就是这款");
}

test("a glass on its own: blind, guess, 对答案", async ({ page }) => {
  await signIn(page);
  await page.click("text=只想快速记个分");
  await page.click("a.dock-add");
  await shot(page, "1-add");
  await page.click(".blind-entry");
  await expect(page.locator(".blind-label-input")).toHaveValue("#1");
  await page.click(".blind-color >> text=红");
  await shot(page, "2-start");
  await page.click("text=开始品 #1");

  await expect(page.locator(".taste-wine .blind-label")).toHaveText("#1");
  await guess(page);
  await shot(page, "3-taste");
  await page.click(".taste-foot >> text=对答案");
  await expect(page.locator(".add-to-list")).toHaveText("#1 其实是哪款酒？");
  await answer(page, "Blind Test Cabernet", "2015");

  await expect(page).toHaveURL(/\/taste\//);
  await expect(page.locator(".blind-result")).toContainText("Blind Test Cabernet");
  // Only the vintage can be scored (the wine has no grape or place): 1 of 2, so 5 / 10.
  await expect(page.locator(".blind-total strong")).toHaveText("5");
  await shot(page, "4-result");
  await page.click("header >> text=完成");
  await expect(page.locator(".wine-title")).toContainText("2015");
});

test("a group: the host adds glasses and answers, 揭晓 shows everyone the wines and a ranking", async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  await signIn(host, "host");
  await host.click("text=只想快速记个分");
  await host.click("text=新建品鉴");
  await host.fill('.sheet input[placeholder^="例如"]', "周五盲品局");
  await host.click("text=建好了");
  for (const label of ["#1", "#2"]) {
    await host.click("text=加一杯盲品");
    await expect(host.locator(".blind-label-input")).toHaveValue(label);
    await host.click(".blind-color >> text=红");
    await host.click(`text=开始品 ${label}`);
    if (label === "#1") await guess(host);
    await host.click("header >> text=完成");
  }
  await expect(host.locator(".rows.numbered .row")).toHaveCount(2);
  await shot(host, "5-list");

  const listId = host.url().split("/lists/")[1]!;
  await expect
    .poll(() =>
      host.evaluate(() =>
        fetch("/api/sync")
          .then((r) => r.json())
          .then((d) => d.tastings.length),
      ),
    )
    .toBe(2);
  const key = (await host.evaluate((id) => fetch(`/api/lists/${id}/board`).then((r) => r.json()), listId)).key;

  // A friend joins and tastes #1 too; they cannot add glasses.
  const friend = await (await browser.newContext()).newPage();
  await friend.goto(`/l/${listId}?k=${key}`);
  await friend.click("text=用 Google 登录并加入");
  await friend.fill('input[type="email"]', `guest${Date.now()}@example.com`);
  await friend.click("text=Dev login");
  await expect(friend).toHaveURL(new RegExp(`/lists/${listId}$`));
  await expect(friend.locator(".rows.numbered .row")).toHaveCount(2);
  await expect(friend.locator("text=加一杯盲品")).toHaveCount(0);
  await friend.locator(".rows.numbered .row").first().click();
  await friend.click(".depth-tabs >> text=快记");
  await friend.locator(".guess-card .chip", { hasText: "赤霞珠" }).click();
  await friend.click("header >> text=完成");

  // The host fills in #1's answer: the friend still sees only #1.
  await host.click("text=对答案");
  await expect(host).toHaveURL(new RegExp(`/answers/${listId}$`));
  await host.locator(".blind-glass").first().locator("a.button", { hasText: "填答案" }).click();
  await answer(host, "Leoville Barton", "2015");
  await expect(host).toHaveURL(new RegExp(`/answers/${listId}$`));
  await expect(host.locator(".blind-glass").first()).toContainText("还没揭晓");
  await shot(host, "6-answers-host");
  await friend.reload();
  await expect(friend.locator("body")).not.toContainText("Leoville");

  await host.click("text=揭晓已填答案的 1 杯");
  await expect(host.locator(".blind-glass").first()).not.toContainText("还没揭晓");
  await expect(host.locator(".ranking .row")).toHaveCount(2);
  await shot(host, "7-revealed");

  await expect(async () => {
    await friend.goto(`/answers/${listId}`);
    await expect(friend.locator(".blind-glass").first()).toContainText("Leoville Barton", { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await shot(friend, "8-friend");
});
