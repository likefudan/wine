import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ulid } from "../src/shared/model";
import { Client, signIn, tasting, vintageOp } from "./helpers";

describe("sign-in", () => {
  it("needs a session for everything personal", async () => {
    const c = new Client();
    expect((await c.call("/api/sync")).status).toBe(401);
    expect((await c.call("/api/ops", { ops: [] })).status).toBe(401);
    const s = await c.call("/api/auth/session");
    expect(s.data.me).toBeNull();
  });

  it("refuses writes from another site", async () => {
    const c = await signIn();
    const { exports } = await import("cloudflare:workers");
    const res = await exports.default.fetch("https://wine.test/api/ops", {
      method: "POST",
      headers: { Origin: "https://evil.test", Cookie: c.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ ops: [] }),
    });
    expect(res.status).toBe(403);
  });

  it("knows the owner and lets them invite", async () => {
    const owner = await signIn("owner@example.com");
    const s = await owner.call("/api/auth/session");
    expect(s.data.me.owner).toBe(true);
    expect((await owner.call("/api/invites", { email: "Friend@Example.com" })).status).toBe(200);
    const list = await owner.call("/api/invites");
    expect(list.data.invites).toEqual([{ email: "friend@example.com", joined: false }]);
    const friend = await signIn("friend@example.com");
    expect((await friend.call("/api/invites")).status).toBe(403);
    expect((await friend.call("/api/auth/session")).data.me.owner).toBe(false);
  });

  it("logs out", async () => {
    const c = await signIn();
    await c.call("/api/auth/logout", {});
    expect((await c.call("/api/sync")).status).toBe(401);
  });
});

describe("wines", () => {
  it("keeps one wine for two spellings, and points the second id at it", async () => {
    const c = await signIn();
    const a = vintageOp();
    const b = vintageOp({ producer: "RIDGE  vineyards", wine: "monte bello" });
    const r = await c.ops([a, b]);
    expect(r.data.results[0]).toEqual({ ok: true, vintageId: a.id });
    expect(r.data.results[1]).toEqual({ ok: true, vintageId: a.id });
    // A note written offline against the second id lands on the kept wine.
    const t = tasting(b.id);
    expect((await c.ops([{ op: "putTasting", tasting: t }])).data.results[0]!.ok).toBe(true);
    const sync = await c.call("/api/sync");
    expect(sync.data.tastings[0].vintageId).toBe(a.id);
    expect(sync.data.vintages).toHaveLength(1);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM wines").first<{ n: number }>();
    expect(n!.n).toBe(1);
  });

  it("finds wines in the shared catalogue by any part of the name", async () => {
    const c = await signIn();
    await c.ops([
      vintageOp(),
      vintageOp({ year: 2018 }),
      vintageOp({ producer: "Opus One", wine: "Opus One", year: 2019 }),
    ]);
    const r = await c.call("/api/catalog?q=monte");
    expect(r.data.wines).toHaveLength(1);
    expect(r.data.wines[0].vintages.map((v: { year: number }) => v.year)).toEqual([2019, 2018]);
    expect((await c.call("/api/catalog?q=ridge%20bello")).data.wines).toHaveLength(1);
    expect((await c.call("/api/catalog?q=opus")).data.wines[0].producer).toBe("Opus One");
  });

  it("refuses a wine without producer or with a bad year", async () => {
    const c = await signIn();
    const r = await c.ops([vintageOp({ producer: " " }), vintageOp({ year: 1700 })]);
    expect(r.data.results.map((x) => x.ok)).toEqual([false, false]);
  });
});

describe("lists and tastings", () => {
  it("syncs a list with its wines and my note", async () => {
    const c = await signIn();
    const v = vintageOp();
    const listId = ulid();
    const itemId = ulid();
    const at = new Date().toISOString();
    const t = tasting(v.id, { listItemId: itemId });
    const r = await c.ops([
      v,
      {
        op: "putList",
        list: {
          id: listId,
          title: "Napa day 1",
          kind: "winery",
          startsOn: "2026-11-20",
          note: null,
          createdAt: at,
          updatedAt: at,
        },
      },
      { op: "putItem", item: { id: itemId, listId, vintageId: v.id, position: 0, priceUsd: 60, createdAt: at } },
      { op: "putTasting", tasting: t },
    ]);
    expect(r.data.results.every((x) => x.ok)).toBe(true);
    const s = (await c.call("/api/sync")).data;
    expect(s.lists[0].title).toBe("Napa day 1");
    expect(s.items[0]).toMatchObject({ id: itemId, vintageId: v.id, priceUsd: 60 });
    expect(s.tastings[0]).toMatchObject({
      id: t.id,
      score: 93,
      buyAgain: true,
      descriptors: [{ id: "blackcurrant", intensity: 2 }],
    });
    expect(s.tastings[0].palate).toEqual({ tannin: 5, acidity: 4 });
  });

  it("is safe to send twice, and keeps the newer edit", async () => {
    const c = await signIn();
    const v = vintageOp();
    const t = tasting(v.id);
    await c.ops([v, { op: "putTasting", tasting: t }]);
    await c.ops([v, { op: "putTasting", tasting: t }]);
    const newer = { ...t, score: 88, updatedAt: new Date(Date.now() + 1000).toISOString() };
    await c.ops([{ op: "putTasting", tasting: newer }]);
    await c.ops([{ op: "putTasting", tasting: t }]); // an old copy arriving late
    const s = (await c.call("/api/sync")).data;
    expect(s.tastings).toHaveLength(1);
    expect(s.tastings[0].score).toBe(88);
  });

  it("drops unknown aroma words and out-of-range scores", async () => {
    const c = await signIn();
    const v = vintageOp();
    const bad = tasting(v.id, { score: 120 });
    const odd = tasting(v.id, {
      descriptors: [
        { id: "cedar", intensity: 9 },
        { id: "unicorn", intensity: 2 },
      ],
    });
    const r = await c.ops([v, { op: "putTasting", tasting: bad }, { op: "putTasting", tasting: odd }]);
    expect(r.data.results.map((x) => x.ok)).toEqual([true, false, true]);
    const s = (await c.call("/api/sync")).data;
    expect(s.tastings[0].descriptors).toEqual([{ id: "cedar", intensity: 2 }]);
  });

  it("keeps people apart", async () => {
    const a = await signIn("owner@example.com");
    const v = vintageOp();
    const listId = ulid();
    const at = new Date().toISOString();
    const t = tasting(v.id);
    await a.ops([
      v,
      {
        op: "putList",
        list: { id: listId, title: "Mine", kind: "home", startsOn: null, note: null, createdAt: at, updatedAt: at },
      },
      { op: "putTasting", tasting: t },
    ]);
    const b = await signIn("b@example.com");
    const r = await b.ops([
      { op: "putTasting", tasting: { ...t, score: 50, updatedAt: new Date(Date.now() + 5000).toISOString() } },
      { op: "putItem", item: { id: ulid(), listId, vintageId: v.id, position: 0, priceUsd: null, createdAt: at } },
      { op: "deleteList", id: listId },
      { op: "deleteTasting", id: t.id },
    ]);
    expect(r.data.results.map((x) => x.ok)).toEqual([false, false, false, true]);
    const s = (await a.call("/api/sync")).data;
    expect(s.lists).toHaveLength(1);
    expect(s.tastings[0].score).toBe(93);
    expect((await b.call("/api/sync")).data.lists).toHaveLength(0);
  });

  it("keeps the notes in my library when a list is deleted", async () => {
    const c = await signIn();
    const v = vintageOp();
    const listId = ulid(),
      itemId = ulid();
    const at = new Date().toISOString();
    await c.ops([
      v,
      {
        op: "putList",
        list: { id: listId, title: "Trip", kind: "trip", startsOn: null, note: null, createdAt: at, updatedAt: at },
      },
      { op: "putItem", item: { id: itemId, listId, vintageId: v.id, position: 0, priceUsd: null, createdAt: at } },
      { op: "putTasting", tasting: tasting(v.id, { listItemId: itemId }) },
      { op: "deleteList", id: listId },
    ]);
    const s = (await c.call("/api/sync")).data;
    expect(s.lists).toHaveLength(0);
    expect(s.tastings).toHaveLength(1);
    expect(s.tastings[0].listItemId).toBeNull();
  });

  it("reorders the wines of a list", async () => {
    const c = await signIn();
    const v = vintageOp();
    const listId = ulid();
    const at = new Date().toISOString();
    const ids = [ulid(), ulid(), ulid()];
    await c.ops([
      v,
      {
        op: "putList",
        list: { id: listId, title: "Order", kind: "winery", startsOn: null, note: null, createdAt: at, updatedAt: at },
      },
      ...ids.map((id, n) => ({
        op: "putItem" as const,
        item: { id, listId, vintageId: v.id, position: n, priceUsd: null, createdAt: at },
      })),
      { op: "reorder", listId, ids: [ids[2]!, ids[0]!, ids[1]!] },
    ]);
    const s = (await c.call("/api/sync")).data;
    expect(s.items.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it("saves my language and default depth", async () => {
    const c = await signIn();
    await c.ops([{ op: "putMe", locale: "zh-TW", depth: "beginner" }]);
    const me = (await c.call("/api/auth/session")).data.me;
    expect(me).toMatchObject({ locale: "zh-TW", depth: "beginner" });
  });
});

describe("label", () => {
  it("says so when reading labels is not set up", async () => {
    const c = await signIn();
    const r = await c.call("/api/label", { image: "abc" });
    expect(r.status).toBe(503);
  });
});
