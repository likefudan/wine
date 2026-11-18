import { type CDPSession, expect, type Page, test } from "@playwright/test";

// 下拉刷新 for the app opened from the home screen, where the phone gives none of its own.
async function drag(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  const steps = 12;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.fill('input[type="email"]', `ptr${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await expect(page.locator(".tabbar")).toBeVisible();
}

test.describe("opened from the home screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone") ? ({ matches: true } as MediaQueryList) : real(q);
    });
  });

  test("pulling down from the top fetches my copy again", async ({ page }) => {
    await signIn(page);
    const cdp = await page.context().newCDPSession(page);
    await page.waitForTimeout(500);

    // A sideways swipe is not a pull.
    let syncs = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/sync")) syncs++;
    });
    await drag(cdp, { x: 300, y: 200 }, { x: 60, y: 260 });
    await page.waitForTimeout(700);
    expect(syncs).toBe(0);
    await expect(page.locator(".ptr")).toHaveCount(0);

    // A short pull springs back without refreshing.
    await drag(cdp, { x: 200, y: 200 }, { x: 200, y: 260 });
    await page.waitForTimeout(700);
    expect(syncs).toBe(0);

    // A long one refreshes, shows the spinner, then goes away.
    const synced = page.waitForRequest((r) => r.url().endsWith("/api/sync"));
    await drag(cdp, { x: 200, y: 200 }, { x: 200, y: 420 });
    await synced;
    await expect(page.locator(".ptr.busy")).toBeVisible();
    await expect(page.locator(".ptr")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  });

  test("a new release on the server reloads into it", async ({ page }) => {
    await signIn(page);
    const cdp = await page.context().newCDPSession(page);
    await page.waitForTimeout(500);
    // The server's page now names another build of the app.
    await page.route(
      (u) => u.pathname === "/",
      async (route) => {
        if (route.request().isNavigationRequest()) return route.continue();
        const res = await route.fetch();
        const html = (await res.text()).replace(/\/assets\/index-[^"]+\.js/, "/assets/index-NEW.js");
        await route.fulfill({ response: res, body: html });
      },
    );
    await page.evaluate(() => {
      (window as { marker?: number }).marker = 1;
    });
    const reloaded = page.waitForEvent("load");
    await drag(cdp, { x: 200, y: 200 }, { x: 200, y: 420 });
    await reloaded;
    expect(await page.evaluate(() => (window as { marker?: number }).marker)).toBeUndefined();
  });
});

test("no pull to refresh in a normal browser tab", async ({ page }) => {
  await signIn(page);
  const cdp = await page.context().newCDPSession(page);
  await drag(cdp, { x: 200, y: 200 }, { x: 200, y: 420 });
  await page.waitForTimeout(300);
  await expect(page.locator(".ptr")).toHaveCount(0);
});
