import { env, exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { ulid } from "../src/shared/model";
import { VINTAGE_SELECT, vintageInfo } from "../src/worker/data";
import { requireBudget } from "../src/worker/costs";
import { claimJob, modelsFor } from "../src/worker/label";
import { prosePrompt } from "../src/worker/prose";
import { suggestPlaces } from "../src/worker/places";
import { Client, signIn, tasting, vintageOp } from "./helpers";

describe("sign-in", () => {
  it("extends a session that is in use, and leaves a fresh one alone", async () => {
    const c = await signIn();
    const soon = new Date(Date.now() + 3 * 86400_000).toISOString();
    await env.DB.prepare("UPDATE sessions SET expires_at = ?").bind(soon).run();
    const before = c.cookie;
    const r = await c.call("/api/sync");
    expect(r.status).toBe(200);
    expect(c.cookie).toBe(before);
    const row = await env.DB.prepare("SELECT MIN(expires_at) AS at FROM sessions").first<{ at: string }>();
    expect(Date.parse(row!.at)).toBeGreaterThan(Date.now() + 25 * 86400_000);
    // Already far from expiry: nothing is written.
    const res = await exports.default.fetch("https://wine.test/api/sync", { headers: { Cookie: c.cookie } });
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

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

  it("lets newcomers in while today's free places last, then waits for the owner", async () => {
    const owner = await signIn("owner@example.com");
    expect((await owner.call("/api/auth/session")).data.me).toMatchObject({ owner: true, approved: true });
    expect((await owner.call("/api/settings/auto-approve", { perDay: 1 })).status).toBe(200);

    const first = await signIn("first@example.com");
    expect((await first.call("/api/auth/session")).data.me).toMatchObject({ owner: false, approved: true });
    const second = await signIn("second@example.com");
    expect((await second.call("/api/auth/session")).data.me.approved).toBe(false);
    // Waiting: notes yes, things that cost money no.
    expect((await second.ops([vintageOp()])).data.results[0]!.ok).toBe(true);
    const label = await second.call("/api/label", { image: "abc" });
    expect([label.status, label.data.error]).toEqual([403, "pending_approval"]);
    expect((await second.call("/api/places?q=ridge")).status).toBe(403);
    expect((await second.call("/api/members")).status).toBe(403);

    const list = (await owner.call("/api/members")).data;
    expect(list.autoApprovePerDay).toBe(1);
    const waiting = list.members[0];
    expect([waiting.email, waiting.status]).toEqual(["second@example.com", "pending"]);
    await owner.call(`/api/members/${waiting.id}`, { status: "active" });
    expect((await second.call("/api/auth/session")).data.me.approved).toBe(true);

    // Disabled: signed out at once and cannot sign in again.
    await owner.call(`/api/members/${waiting.id}`, { status: "disabled" });
    expect((await second.call("/api/sync")).status).toBe(401);
    const again = new Client();
    expect((await again.call("/api/auth/dev", { email: "second@example.com" })).status).toBe(403);
  });

  it("with no free places, every newcomer waits", async () => {
    const owner = await signIn("owner@example.com");
    await owner.call("/api/settings/auto-approve", { perDay: 0 });
    const c = await signIn("someone@example.com");
    expect((await c.call("/api/auth/session")).data.me.approved).toBe(false);
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

  it("stores 产区 and 大区 at the same level for every country", async () => {
    const c = await signIn();
    await c.ops([
      vintageOp({ producer: "Opus One", wine: "Opus One", country: "United States", region: "Napa Valley" }),
      vintageOp({
        producer: "Chateau Latour",
        wine: "Grand Vin",
        country: "France",
        region: "Bordeaux",
        appellation: "Pauillac",
      }),
      vintageOp({
        producer: "Shafer",
        wine: "Hillside Select",
        country: "",
        region: "Napa Valley",
        appellation: "Stags Leap District",
      }),
      vintageOp({
        producer: "Antinori",
        wine: "Tignanello",
        country: "Italy",
        region: "Tuscany",
        area: "Chianti Classico",
      }),
    ]);
    const rows = await env.DB.prepare(
      "SELECT p.name, p.country, p.region, w.area, w.appellation FROM wines w JOIN producers p ON p.id = w.producer_id",
    ).all<{ name: string; country: string; region: string; area: string; appellation: string }>();
    const where = Object.fromEntries(rows.results.map((r) => [r.name, [r.country, r.region, r.area, r.appellation]]));
    expect(where).toEqual({
      "Opus One": ["USA", "California", "Napa Valley", null],
      "Chateau Latour": ["France", "Bordeaux", "Médoc", "Pauillac"],
      Shafer: ["USA", "California", "Napa Valley", "Stags Leap District"],
      Antinori: ["Italy", "Tuscany", "Chianti Classico", null],
    });
    const sync = (await c.call("/api/catalog?q=shafer")).data;
    expect(sync.wines[0].area).toBe("Napa Valley");
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

  it("suggests LWIN wines by the start of their words, and remembers the one picked", async () => {
    const rows: [number, string, string, string | null, string | null, string[]][] = [
      [1011768, "Chateau Kirwan", "Chateau Kirwan", "red", "Margaux", ["kirwan"]],
      [1008049, "Chateau Kirwan", "Charmes de Kirwan", "red", "Margaux", ["kirwan", "charmes"]],
      [
        1262258,
        "Silverado Vineyards",
        "Miller Ranch Sauvignon Blanc",
        "white",
        null,
        ["silverado", "miller", "ranch", "sauvignon", "blanc"],
      ],
    ];
    for (const [lwin, producer, wine, color, appellation, words] of rows) {
      await env.DB.prepare("INSERT INTO lwin VALUES (?, ?, ?, ?, 'France', 'Bordeaux', ?, NULL)")
        .bind(lwin, producer, wine, color, appellation)
        .run();
      for (const w of words) await env.DB.prepare("INSERT INTO lwin_words VALUES (?, ?)").bind(w, lwin).run();
    }
    const c = await signIn();
    const kir = (await c.call("/api/catalog?q=Château%20Kirw")).data.lwin;
    expect(kir.map((w: { lwin: number }) => w.lwin)).toEqual([1011768, 1008049]);
    expect((await c.call("/api/catalog?q=charm%20kirwan")).data.lwin).toHaveLength(1);
    expect((await c.call("/api/catalog?q=silverado%20sauv")).data.lwin[0].appellation).toBeNull();
    expect((await c.call("/api/catalog?q=k")).data.lwin).toEqual([]);

    await c.ops([vintageOp({ producer: "Chateau Kirwan", wine: "Chateau Kirwan", year: 2022, lwin: 1011768 })]);
    const w = await env.DB.prepare("SELECT lwin FROM wines WHERE name = 'Chateau Kirwan'").first<{ lwin: number }>();
    expect(w!.lwin).toBe(1011768);
  });

  it("suggests TTB labels from the same index, without keeping their ids on a wine", async () => {
    await env.DB.prepare(
      "INSERT INTO lwin VALUES (-7, 'Old Oaks Winery', 'Old Oaks Winery', 'red', 'USA', 'Illinois', NULL, NULL)",
    ).run();
    for (const w of ["old", "oaks"]) await env.DB.prepare("INSERT INTO lwin_words VALUES (?, -7)").bind(w).run();
    const c = await signIn();
    const found = (await c.call("/api/catalog?q=old%20oaks")).data.lwin;
    expect(found.map((x: { lwin: number; region: string }) => [x.lwin, x.region])).toEqual([[-7, "Illinois"]]);
    await c.ops([vintageOp({ producer: "Old Oaks Winery", wine: "Old Oaks Winery", year: 2024, lwin: -7 })]);
    const w = await env.DB.prepare("SELECT lwin FROM wines WHERE name = 'Old Oaks Winery'").first<{
      lwin: number | null;
    }>();
    expect(w!.lwin).toBeNull();
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
          place: {
            name: "Opus One",
            id: "ChIJopusone123",
            address: "7900 St Helena Hwy, Oakville, CA",
            lat: 38.4,
            lng: -122.4,
          },
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
    expect(s.lists[0].place).toEqual({
      name: "Opus One",
      id: "ChIJopusone123",
      address: "7900 St Helena Hwy, Oakville, CA",
      lat: 38.4,
      lng: -122.4,
    });
    // An older app sends no place: the saved one stays.
    const { place: _, ...old } = s.lists[0];
    await c.ops([{ op: "putList", list: { ...old, title: "Napa day 1!" } }]);
    const again = (await c.call("/api/sync")).data.lists[0];
    expect(again).toMatchObject({ title: "Napa day 1!", place: { name: "Opus One" } });
    // A place typed by hand has only a name.
    await c.ops([
      {
        op: "putList",
        list: { ...again, place: { name: " Grandma's ", id: "bad id", address: null, lat: 1, lng: 2 } },
      },
    ]);
    expect((await c.call("/api/sync")).data.lists[0].place).toEqual({
      name: "Grandma's",
      id: null,
      address: null,
      lat: null,
      lng: null,
    });
    // An address with no name, typed by hand.
    await c.ops([
      { op: "putList", list: { ...again, place: { name: "", id: null, address: "1 Park Ave", lat: null, lng: null } } },
    ]);
    expect((await c.call("/api/sync")).data.lists[0].place).toMatchObject({ name: "", address: "1 Park Ave" });
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

  it("does not let an edit from a phone whose clock runs fast beat later edits", async () => {
    const c = await signIn();
    const v = vintageOp();
    const t = tasting(v.id);
    // A phone a day ahead: its edit counts as made now, not tomorrow.
    const ahead = { ...t, score: 80, updatedAt: new Date(Date.now() + 86400_000).toISOString() };
    await c.ops([v, { op: "putTasting", tasting: ahead }]);
    const later = { ...t, score: 92, updatedAt: new Date(Date.now() + 5_000).toISOString() };
    await c.ops([{ op: "putTasting", tasting: later }]);
    const s = (await c.call("/api/sync")).data;
    expect(s.tastings[0].score).toBe(92);
  });

  it("keeps where a glass was tasted: an older app leaves it, null removes it", async () => {
    const c = await signIn();
    const v = vintageOp();
    const loc = {
      lat: 38.4321234567,
      lng: -122.41,
      accuracy: 12.4,
      name: "Opus One",
      address: "7900 St Helena Hwy",
      placeId: null,
      geocoded: true,
    };
    const t = tasting(v.id, { location: loc });
    await c.ops([v, { op: "putTasting", tasting: t }]);
    let s = (await c.call("/api/sync")).data;
    expect(s.tastings[0].location).toEqual({ ...loc, lat: 38.432123, accuracy: 12 });
    // An older app sends no location.
    const { location: _, ...old } = { ...t, score: 90, updatedAt: new Date(Date.now() + 1000).toISOString() };
    await c.ops([{ op: "putTasting", tasting: old as typeof t }]);
    s = (await c.call("/api/sync")).data;
    expect(s.tastings[0]).toMatchObject({ score: 90, location: { name: "Opus One" } });
    await c.ops([
      { op: "putTasting", tasting: { ...t, location: null, updatedAt: new Date(Date.now() + 2000).toISOString() } },
    ]);
    s = (await c.call("/api/sync")).data;
    expect(s.tastings[0].location).toBeNull();
    // Nonsense is dropped, not stored.
    await c.ops([
      {
        op: "putTasting",
        tasting: { ...t, location: { lat: 999 } as never, updatedAt: new Date(Date.now() + 3000).toISOString() },
      },
    ]);
    expect((await c.call("/api/sync")).data.tastings[0].location).toBeNull();
  });

  it("remembers 记下品酒地点", async () => {
    const c = await signIn();
    expect((await c.call("/api/sync")).data.me.locationOn).toBeNull();
    await c.ops([{ op: "putMe", locationOn: false }]);
    expect((await c.call("/api/sync")).data.me.locationOn).toBe(false);
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
      palate: { acidity: 3, flavours: ["cedar", "unicorn", "cedar", "vanilla"] },
    });
    const r = await c.ops([v, { op: "putTasting", tasting: bad }, { op: "putTasting", tasting: odd }]);
    expect(r.data.results.map((x) => x.ok)).toEqual([true, false, true]);
    const s = (await c.call("/api/sync")).data;
    expect(s.tastings[0].descriptors).toEqual([{ id: "cedar", intensity: 2 }]);
    expect(s.tastings[0].palate).toEqual({ acidity: 3, flavours: ["cedar", "vanilla"] });
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
        list: {
          id: listId,
          title: "Mine",
          kind: "home",
          startsOn: null,
          place: null,
          note: null,
          createdAt: at,
          updatedAt: at,
        },
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
        list: {
          id: listId,
          title: "Trip",
          kind: "trip",
          startsOn: null,
          place: null,
          note: null,
          createdAt: at,
          updatedAt: at,
        },
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
        list: {
          id: listId,
          title: "Order",
          kind: "winery",
          startsOn: null,
          place: null,
          note: null,
          createdAt: at,
          updatedAt: at,
        },
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

describe("producer places", () => {
  it("is plain text without a Google key", async () => {
    const c = await signIn();
    expect((await c.call("/api/places?q=ridge")).data.places).toEqual([]);
    expect((await c.call("/api/places/ChIJabcdefghij")).data.place).toBeNull();
  });

  it("asks Google for wineries first, then anything", async () => {
    const seen: unknown[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const body = JSON.parse(String(init?.body));
      seen.push(body.includedPrimaryTypes ?? null);
      const hit = {
        placePrediction: {
          placeId: "ChIJridge12345",
          text: { text: "Ridge Vineyards, Cupertino" },
          structuredFormat: { mainText: { text: "Ridge Vineyards" }, secondaryText: { text: "Cupertino, CA, USA" } },
        },
      };
      return Response.json({ suggestions: body.includedPrimaryTypes ? [] : [hit] });
    });
    try {
      const r = await suggestPlaces({ GOOGLE_MAPS_API_KEY: "k" } as never, "ridge", "abcdefgh-1234");
      expect(r).toEqual([{ id: "ChIJridge12345", name: "Ridge Vineyards", detail: "Cupertino, CA, USA" }]);
      expect(seen).toEqual([["winery"], null]);
      seen.length = 0;
      await suggestPlaces({ GOOGLE_MAPS_API_KEY: "k" } as never, "napa", "abcdefgh-1234", "any");
      expect(seen).toEqual([null]);
      seen.length = 0;
      await suggestPlaces({ GOOGLE_MAPS_API_KEY: "k" } as never, "french laundry", "abcdefgh-1234", "restaurant");
      expect(seen).toEqual([["restaurant"], null]);
      seen.length = 0;
      await suggestPlaces({ GOOGLE_MAPS_API_KEY: "k" } as never, "123 main st", "abcdefgh-1234", "address");
      expect(seen).toEqual([["street_address", "premise", "subpremise"], null]);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps the first place a producer was pinned to", async () => {
    const c = await signIn();
    const place = { id: "ChIJridge12345", address: "17100 Montebello Rd, Cupertino, CA", lat: 37.3, lng: -122.1 };
    await c.ops([vintageOp({ place })]);
    await c.ops([vintageOp({ year: 2018, place: { ...place, id: "ChIJsomewhere1", address: "Elsewhere" } })]);
    const p = await env.DB.prepare("SELECT place_id, address, lat FROM producers").first();
    expect(p).toEqual({ place_id: place.id, address: place.address, lat: 37.3 });
    const row = await env.DB.prepare("SELECT v.id FROM vintages v LIMIT 1").first<{ id: string }>();
    expect(
      vintageInfo((await env.DB.prepare(`${VINTAGE_SELECT} WHERE v.id = ?`).bind(row!.id).first())!).place?.address,
    ).toBe(place.address);
  });
});

describe("label", () => {
  it("keeps the label model each person picks, and tries it first", async () => {
    const c = await signIn();
    expect((await c.call("/api/sync")).data.me.labelModel).toBeNull();
    await c.ops([{ op: "putMe", labelModel: "DeepSeek-V4.1-Flash-1017" }]);
    expect((await c.call("/api/sync")).data.me.labelModel).toBe("DeepSeek-V4.1-Flash-1017");
    await c.ops([{ op: "putMe", labelModel: "gpt-nope" as never }]);
    expect((await c.call("/api/sync")).data.me.labelModel).toBe("DeepSeek-V4.1-Flash-1017");
    // One fallback, never a chain of three paid calls.
    expect(modelsFor("DeepSeek-V4.1-Flash-1017")).toEqual(["DeepSeek-V4.1-Flash-1017", "claude-sonnet-5-5"]);
    expect(modelsFor(null)).toEqual(["claude-sonnet-5-5", "claude-fable-5-1"]);
    // Opus only for owners; anyone else who picked it gets the default.
    expect(modelsFor("claude-opus-5-5")).toEqual(["claude-sonnet-5-5", "claude-fable-5-1"]);
    expect(modelsFor("claude-opus-5-5", true)).toEqual(["claude-opus-5-5", "claude-sonnet-5-5"]);
  });

  it("says so when reading labels is not set up", async () => {
    const c = await signIn();
    const r = await c.call("/api/label", { image: "abc" });
    expect(r.status).toBe(503);
  });
});

describe("spending limits", () => {
  it("lets only as many jobs in as the daily allowance, even when they arrive together", async () => {
    const c = await signIn("limits@example.com");
    const me = (await c.call("/api/sync")).data.me;
    const tries = await Promise.all(Array.from({ length: 6 }, () => claimJob(env as never, me.id, "label", ulid(), 4)));
    expect(tries.filter(Boolean)).toHaveLength(4);
  });

  it("stops paid features for everyone but owners once the daily budget is spent", async () => {
    const owner = await signIn();
    expect((await owner.call("/api/admin/budget", { budget: 1 })).data.budget).toBe(1);
    await env.DB.prepare(
      "INSERT INTO ai_calls (id, feature, model, cost_usd, created_at) VALUES (?, 'label', 'x', 2, ?)",
    )
      .bind(ulid(), new Date().toISOString())
      .run();
    await requireBudget(env as never, { email: "owner@example.com" });
    await expect(requireBudget(env as never, { email: "someone@example.com" })).rejects.toThrow("额度用完");
    const other = await signIn("guest-budget@example.com");
    expect((await other.call("/api/admin/budget")).status).toBe(403);
    expect((await other.call("/api/places?q=ridge")).data.error).toBe("budget_spent");
    await owner.call("/api/admin/budget", { budget: 10 });
  });

  it("counts every Google call a place lookup makes", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ suggestions: [] }));
    try {
      const meter: string[] = [];
      await suggestPlaces({ GOOGLE_MAPS_API_KEY: "k" } as never, "ridge", "abcdefgh-1234", "winery", meter);
      // Wineries first, then anything: two billed calls.
      expect(meter).toEqual(["google-places-autocomplete", "google-places-autocomplete"]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("分享图 note", () => {
  it("says so when AI is not set up", async () => {
    const c = await signIn();
    const r = await c.call("/api/prose", { wine: { producer: "Ridge", wine: "Monte Bello", year: 2016 }, lang: "en" });
    expect([r.status, r.data.error]).toEqual([503, "ai_off"]);
    expect((await new Client().call("/api/prose", {})).status).toBe(401);
  });

  it("asks for a faithful note in the reader's language, without the score", () => {
    const prompt = prosePrompt(
      "zh-TW",
      ["Wine: Ridge Monte Bello 2016"],
      ["Aromas: Blackcurrant"],
      ["USA", "California"],
    );
    expect(prompt).toContain("Traditional Chinese");
    expect(prompt).toContain("Aromas: Blackcurrant");
    expect(prompt).toContain("1. USA\n2. California");
    expect(prompt).toContain("Never add an aroma");
  });
});

describe("分享图 photo", () => {
  it("needs the photo bucket, and a sign-in", async () => {
    const c = await signIn();
    const r = await c.call("/api/photos", { image: "abc" });
    expect([r.status, r.data.error]).toEqual([503, "photos_off"]);
    expect((await new Client().call("/api/photos", { image: "abc" })).status).toBe(401);
  });
});
