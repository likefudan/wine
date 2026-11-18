import { type Page, expect, test } from "@playwright/test";
import { ulid } from "../src/shared/model";

// 朋友动态: a friend's notes in a shared 品鉴 show on 品鉴, on /friends and on the wine's page,
// behind 盲评 until I hand in my own.

async function signIn(page: Page, who: string, depth = "只想快速记个分") {
  await page.goto("/");
  await page.fill('input[type="email"]', `${who}${Date.now()}@example.com`);
  await page.click("text=Dev login");
  await page.click(`text=${depth}`);
  await expect(page.locator(".section-head-title")).toBeVisible();
}

const ops = (page: Page, list: unknown[]) =>
  page.evaluate(
    (o) =>
      fetch("/api/ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: o }),
      })
        .then((r) => r.json())
        .then((d) => d.results.every((x: { ok: boolean }) => x.ok)),
    list,
  );

const note = (vintageId: string, listItemId: string, over: Record<string, unknown>) => {
  const at = new Date().toISOString();
  return {
    op: "putTasting",
    tasting: {
      id: ulid(),
      vintageId,
      listItemId,
      tastedAt: at,
      depth: "standard",
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
      ...over,
    },
  };
};

test("friends' notes show behind 盲评 until I hand in mine", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signIn(owner, "feedowner");
  const at = new Date().toISOString();
  const listId = ulid();
  const vintageId = ulid();
  const itemId = ulid();
  expect(
    await ops(owner, [
      {
        op: "putList",
        list: {
          id: listId,
          title: "Napa 第二天",
          kind: "winery",
          startsOn: null,
          place: null,
          note: null,
          createdAt: at,
          updatedAt: at,
        },
      },
      {
        op: "putVintage",
        id: vintageId,
        producer: "Ridge Vineyards",
        wine: "Monte Bello",
        year: 2019,
        color: "red",
        region: "Santa Cruz Mountains",
        country: "USA",
        grapes: ["Cabernet Sauvignon"],
      },
      { op: "putItem", item: { id: itemId, listId, vintageId, position: 0, priceUsd: null, createdAt: at } },
    ]),
  ).toBe(true);
  const key = (await owner.evaluate((id) => fetch(`/api/lists/${id}/board`).then((r) => r.json()), listId)).key;

  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await signIn(friend, "xiaowang");
  await friend.evaluate(
    ([id, k]) =>
      fetch(`/api/lists/${id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k }),
      }),
    [listId, key],
  );
  expect(
    await ops(friend, [
      note(vintageId, itemId, {
        score: 95,
        note: "黑醋栗和雪松，单宁很细",
        buyAgain: true,
        descriptors: [
          { id: "blackcurrant", intensity: 3 },
          { id: "cedar", intensity: 2 },
        ],
      }),
    ]),
  ).toBe(true);

  // 品鉴: the friend rated it, but 盲评 keeps the score and words away.
  await owner.goto("/");
  const section = owner.locator("section.friends");
  await expect(section.locator(".friend-note")).toHaveCount(1);
  await expect(section).toContainText("1 条新的");
  await expect(section.locator(".friend-note")).toContainText("盲评中");
  await expect(section.locator(".row-score")).toHaveCount(0);
  await expect(section).not.toContainText("黑醋栗");

  // I hand in mine: theirs opens.
  expect(await ops(owner, [note(vintageId, itemId, { score: 92 })])).toBe(true);
  await owner.click("section.friends >> text=全部");
  await expect(owner).toHaveURL(/\/friends$/);
  const card = owner.locator(".friend-note");
  await expect(card.locator(".row-score")).toHaveText("95");
  await expect(card).toContainText("黑醋栗 · 雪松");
  await expect(card).toContainText("黑醋栗和雪松，单宁很细");
  await expect(card).toContainText("Napa 第二天");
  await owner.screenshot({ path: "test-results/friends-feed.png" });

  // Seen: the badge goes once /friends was open.
  await owner.goto("/");
  await expect(owner.locator("section.friends")).not.toContainText("条新的");

  // The wine's page has their note too; tapping it opens the shared 品鉴.
  await owner.goto(`/wine/${vintageId}`);
  await expect(owner.locator("text=朋友的评价")).toBeVisible();
  await expect(owner.locator(".friend-note .row-score")).toHaveText("95");
  await owner.locator(".friend-note").click();
  await expect(owner).toHaveURL(new RegExp(`/lists/${listId}$`));

  await ownerCtx.close();
  await friendCtx.close();
});
