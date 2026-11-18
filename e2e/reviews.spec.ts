import { expect, test } from "@playwright/test";

// 专业评价 on a wine's page: folded until I've noted the wine, the shared lookup (answered here, since
// the test server has no AI), and 用自己的 AI 查 with a pasted answer kept just for me.
test("a wine's page looks up critic reviews and takes an answer from my own AI", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.fill('input[type="email"]', `reviews${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click("text=只想快速记个分");

  // A wine I haven't noted yet, put there through the API.
  const vid = await page.evaluate(async () => {
    const id = () =>
      Array.from(crypto.getRandomValues(new Uint8Array(26)), (b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join(
        "",
      );
    const vintageId = id();
    const at = new Date().toISOString();
    const ops = [
      { op: "putVintage", id: vintageId, producer: "Opus One", wine: "Opus One", year: 2019, color: "red", grapes: [] },
      {
        op: "putTasting",
        tasting: {
          id: id(),
          vintageId,
          listItemId: null,
          tastedAt: at,
          depth: "quick",
          appearance: {},
          nose: {},
          palate: {},
          extra: {},
          guesses: {},
          descriptors: [],
          quality: null,
          score: null,
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
    return vintageId;
  });

  const review = {
    critics: [
      {
        publication: "Wine Advocate",
        reviewer: "William Kelley",
        score: "97-99",
        url: "https://wine.com/x",
        via: "wine.com",
      },
      {
        publication: "Wine Advocate",
        reviewer: "Lisa Perrotti-Brown",
        score: "98",
        url: "https://wine.com/y",
        via: "wine.com",
      },
    ],
    community: { avg: 93.1, count: 59, url: "https://www.cellartracker.com/wine.asp?iWine=1" },
    price: { usd: 461, url: "https://www.wine-searcher.com/find/opus+one/2019" },
    drinkWindow: "2027-2050",
    aromas: ["blackcurrant", "cedar"],
    summary: { zh: "结构严谨的纳帕混酿。", tw: "結構嚴謹的納帕混釀。", en: "A tightly built Napa blend." },
    links: { wineSearcher: "https://www.wine-searcher.com/x", cellarTracker: "https://www.cellartracker.com/x" },
  };
  let looked = false;
  await page.route(`**/api/reviews/${vid}`, async (r) => {
    const real = await (await r.fetch()).json();
    await r.fulfill({
      json: {
        ...real,
        available: true,
        left: 5,
        shared: looked ? { status: "done", review, fetchedAt: new Date().toISOString(), canRefresh: false } : null,
      },
    });
  });
  await page.route(`**/api/reviews/${vid}/lookup`, async (r) => {
    looked = true;
    await r.fulfill({
      json: {
        available: true,
        left: 4,
        mine: null,
        shared: { status: "done", review, fetchedAt: new Date().toISOString(), canRefresh: false },
      },
    });
  });

  await page.goto(`/wine/${vid}`);
  // Not noted yet: folded, so my own impressions come first.
  await expect(page.locator(".pro-folded")).toBeVisible();
  await page.click("text=现在就看");
  await page.click("text=查专业评价");
  await expect(page.locator(".pro-scores li")).toHaveCount(1);
  await expect(page.locator(".pro-scores")).toContainText("97-99");
  await expect(page.locator(".pro-scores")).toContainText("Lisa Perrotti-Brown");
  await expect(page.locator(".pro-scores")).toContainText("经 wine.com 转引");
  await expect(page.locator(".pro-facts")).toContainText("93.1");
  await expect(page.locator(".pro-aromas")).toContainText("黑醋栗");
  await page.unroute(`**/api/reviews/${vid}`);
  await page.unroute(`**/api/reviews/${vid}/lookup`);

  // 用自己的 AI 查, against the real server.
  await page.click("text=用自己的 AI 查");
  await page.click("text=复制提示词");
  await expect(page.locator("text=已复制提示词 ✓")).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("Opus One");
  expect(prompt).toContain("=== WINE-JOURNAL ===");
  await page.fill(
    ".sheet textarea",
    `找到了这些：\n=== WINE-JOURNAL ===\n{"critics":[{"publication":"Decanter","reviewer":null,"score":"96","url":"https://decanter.com/x"}],"community":null,"price_usd":null,"drink_window":null,"aromas":["cassis"],"summary":"很好。"}\n=== END ===`,
  );
  await page.click('.sheet button[type="submit"]');
  await expect(page.locator(".pro-card.mine")).toContainText("用户导入，未核实");
  await expect(page.locator(".pro-card.mine")).toContainText("Decanter");
});
