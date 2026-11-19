import { type Page, expect, test } from "@playwright/test";

// Notes not uploaded yet are never thrown away: not when the session runs out, not when the server
// refuses a change.

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.fill('input[type="email"]', email);
  await page.click("text=Dev login");
}

async function newWine(page: Page, name: string) {
  await page.click('a[href^="/add"]');
  await page.fill("input.search", name);
  await page.click(`text=新酒：${name}`);
  await page.fill('input[placeholder="2019"]', "2021");
  await page.click(".choice >> text=红");
  await page.click("text=开始品鉴");
  await expect(page).toHaveURL(/\/taste\//);
}

test("a note made offline survives the session running out", async ({ page, context }) => {
  const email = `expire${Date.now()}@example.com`;
  await signIn(page, email);
  await page.click("text=只想快速记个分");
  await context.setOffline(true);
  await newWine(page, "Offline Winery");
  await page.click("header >> text=完成");
  await page.waitForTimeout(500);

  // A month later: the session is gone.
  await context.clearCookies();
  await context.setOffline(false);
  await page.goto("/");
  await expect(page.locator(".notice[role=status]")).toContainText("没上传");

  await page.fill('input[type="email"]', email);
  await page.click("text=Dev login");
  await expect(page.locator(".tabbar")).toBeVisible();
  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/sync").then((r) => r.json()))).tastings?.length)
    .toBe(1);
});

test("a change the server refuses stays on the phone until I retry or let it go", async ({ page }) => {
  await signIn(page, `refused${Date.now()}@example.com`);
  await page.click("text=只想快速记个分");
  let refuse = true;
  await page.route("**/api/ops", async (route) => {
    if (!refuse) return route.continue();
    // The server refuses the note itself (the wine goes in).
    const { ops } = route.request().postDataJSON() as { ops: { op: string }[] };
    const kept = ops.filter((o) => o.op !== "putTasting");
    const res = kept.length
      ? ((await (await route.fetch({ postData: JSON.stringify({ ops: kept }) })).json()) as {
          results: unknown[];
        })
      : { results: [] };
    let n = 0;
    const results = ops.map((o) => (o.op === "putTasting" ? { ok: false, error: "内容无效" } : res.results[n++]));
    await route.fulfill({ json: { results } });
  });
  await newWine(page, "Refused Winery");
  await expect(page.locator(".sync-bar.warn")).toContainText("没能保存");
  await page.click(".sync-bar.warn >> text=知道了");
  await page.click("header >> text=完成");

  // The server's copy (without it) comes back, but the note is still here.
  await page.click(".tabbar >> text=酒册");
  await expect(page.locator(".rows .row")).toHaveCount(1);

  // Everything has gone up (and the note was refused) before the page reloads.
  const saved = () =>
    page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const open = indexedDB.open("wine", 1);
          open.onsuccess = () => {
            const get = open.result.transaction("kv").objectStore("kv").get("state");
            get.onsuccess = () => resolve(`${get.result?.queue?.length}/${get.result?.failed?.length}`);
          };
        }),
    );
  await expect.poll(saved).toBe("0/1");
  await page.goto("/me?tab=general");
  await expect(page.locator(".failed-changes")).toContainText("1 条修改", { timeout: 15_000 });
  await expect(page.locator(".sync-status")).not.toContainText("都已备份");
  refuse = false;
  await page.click("text=再试一次");
  await expect(page.locator(".failed-changes")).toHaveCount(0);
  await expect
    .poll(async () => (await page.evaluate(() => fetch("/api/sync").then((r) => r.json()))).tastings?.length)
    .toBe(1);
});
