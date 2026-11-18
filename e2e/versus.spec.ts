import { expect, test } from "@playwright/test";

// 我 vs 专业: under the shared lookup, the aromas the reviews and I both found, the ones I didn't
// note (with a nudge when I was close), and "找到了" adding one to my note.
test("compares my aromas with the critics' and adds one I find on a second sniff", async ({ page }) => {
  await page.goto("/");
  await page.fill('input[type="email"]', `versus${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");
  await expect(page.locator(".section-head-title")).toBeVisible();

  const vid = await page.evaluate(async () => {
    const id = () =>
      Array.from(crypto.getRandomValues(new Uint8Array(26)), (b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join(
        "",
      );
    const vintageId = id();
    const at = new Date().toISOString();
    const ops = [
      {
        op: "putVintage",
        id: vintageId,
        producer: "Versus Cellars",
        wine: `Reserve ${Date.now()}`,
        year: 2018,
        color: "red",
        grapes: [],
      },
      {
        op: "putTasting",
        tasting: {
          id: id(),
          vintageId,
          listItemId: null,
          tastedAt: at,
          depth: "beginner",
          appearance: {},
          nose: {},
          palate: {},
          extra: {},
          guesses: {},
          descriptors: [
            { id: "blackcurrant", intensity: 2 },
            { id: "raspberry", intensity: 1 },
            { id: "violet", intensity: 1 },
          ],
          quality: null,
          score: 90,
          buyAgain: null,
          boughtQty: null,
          priceUsd: null,
          note: null,
          photoId: null,
          updatedAt: at,
        },
      },
    ];
    await fetch("/api/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    });
    // The phone's own copy, so the wine page has it.
    const sync = await (await fetch("/api/sync")).json();
    return { vintageId, n: sync.tastings.length as number };
  });
  expect(vid.n).toBe(1);

  const review = {
    critics: [],
    community: null,
    price: null,
    drinkWindow: null,
    aromas: ["blackcurrant", "red-cherry", "cedar"],
    summary: null,
    links: { wineSearcher: "https://www.wine-searcher.com/x", cellarTracker: "https://www.cellartracker.com/x" },
  };
  await page.route(`**/api/reviews/${vid.vintageId}`, (r) =>
    r.fulfill({
      json: {
        available: true,
        left: 5,
        mine: null,
        shared: { status: "done", review, fetchedAt: new Date().toISOString(), canRefresh: false },
      },
    }),
  );

  // Fresh load so the phone's copy has the note written through the API.
  await page.evaluate(() =>
    indexedDB.databases().then((dbs) => dbs.forEach((d) => d.name && indexedDB.deleteDatabase(d.name))),
  );
  await page.goto(`/wine/${vid.vintageId}`);
  const box = page.locator(".versus");
  await expect(box).toContainText("酒评里提到 3 种香气，你也记下了 1 种。");
  await expect(box.locator(".chip.on")).toHaveText("✓ 黑醋栗");
  await expect(box.locator(".versus-missed li")).toHaveCount(2);
  await expect(box.locator(".versus-missed li").first()).toContainText("你记了覆盆子，都属于红色水果，方向是对的。");
  await expect(box).toContainText("只有你闻到的");
  await expect(box).toContainText("紫罗兰");
  await page.screenshot({ path: "test-results/versus.png", fullPage: true });

  // A second sniff: cedar is there after all.
  await box.locator(".versus-missed li", { hasText: "雪松" }).locator("text=找到了").click();
  await expect(box).toContainText("你也记下了 2 种");
  await expect(box.locator(".versus-missed li")).toHaveCount(1);
});
