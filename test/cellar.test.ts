import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { type CellarLot, cellarAlerts, parseWindow, windowLabel, windowOf, windowStatus } from "../src/shared/cellar";
import { ulid } from "../src/shared/model";
import { signIn, tasting, vintageOp } from "./helpers";

const lot = (vintageId: string, over: Partial<CellarLot> = {}): CellarLot => {
  const at = new Date().toISOString();
  return {
    id: ulid(),
    vintageId,
    qty: 6,
    sizeMl: 750,
    location: "家里酒柜",
    boughtOn: "2026-10-01",
    price: 320,
    currency: "CNY",
    source: "Ridge",
    drinkFrom: 2028,
    drinkTo: 2040,
    note: null,
    createdAt: at,
    updatedAt: at,
    ...over,
  };
};

describe("酒窖 ops", () => {
  it("keeps my lots, brings their wines down, and keeps the newer change", async () => {
    const c = await signIn();
    const v = vintageOp();
    const l = lot(v.id);
    expect((await c.ops([v, { op: "putCellar", lot: l }])).data.results.every((r) => r.ok)).toBe(true);
    const later = { ...l, qty: 5, updatedAt: new Date(Date.now() + 1000).toISOString() };
    await c.ops([{ op: "putCellar", lot: later }]);
    await c.ops([{ op: "putCellar", lot: l }]); // an old copy arriving late
    const s = (await c.call("/api/sync")).data;
    expect(s.cellar).toHaveLength(1);
    expect(s.cellar[0]).toMatchObject({ qty: 5, location: "家里酒柜", price: 320, currency: "CNY", drinkTo: 2040 });
    // A wine only in the cellar (never tasted) is still in my copy.
    expect(s.vintages.map((x: { id: string }) => x.id)).toContain(v.id);
  });

  it("refuses someone else's lot and bad numbers", async () => {
    const a = await signIn("a@example.com");
    const b = await signIn("b@example.com");
    const v = vintageOp();
    const l = lot(v.id);
    await a.ops([v, { op: "putCellar", lot: l }]);
    const r = await b.ops([{ op: "putCellar", lot: { ...l, qty: 0 } }]);
    expect(r.data.results[0]).toMatchObject({ ok: false, error: "只能修改自己的酒窖" });
    const bad = await a.ops([{ op: "putCellar", lot: { ...lot(v.id), qty: -1 } }]);
    expect(bad.data.results[0]).toMatchObject({ ok: false, error: "数量无效" });
    expect((await b.call("/api/sync")).data.cellar).toEqual([]);
    // Deleting someone else's does nothing.
    await b.ops([{ op: "deleteCellar", id: l.id }]);
    expect((await a.call("/api/sync")).data.cellar).toHaveLength(1);
  });

  it("links a note to the bottle it came from, only from my own cellar", async () => {
    const a = await signIn("a@example.com");
    const b = await signIn("b@example.com");
    const v = vintageOp();
    const l = lot(v.id);
    await a.ops([v, { op: "putCellar", lot: l }]);
    const mine = tasting(v.id, { cellarId: l.id });
    await a.ops([{ op: "putTasting", tasting: mine }]);
    await b.ops([v, { op: "putTasting", tasting: tasting(v.id, { cellarId: l.id }) }]);
    expect((await a.call("/api/sync")).data.tastings[0].cellarId).toBe(l.id);
    expect((await b.call("/api/sync")).data.tastings[0].cellarId).toBeNull();
    // An older app sends no cellarId: the link stays.
    const { cellarId: _, ...old } = mine;
    await a.ops([
      { op: "putTasting", tasting: { ...old, score: 90, updatedAt: new Date(Date.now() + 1000).toISOString() } },
    ]);
    expect((await a.call("/api/sync")).data.tastings[0]).toMatchObject({ score: 90, cellarId: l.id });
    // Deleting the lot keeps the note.
    await a.ops([{ op: "deleteCellar", id: l.id }]);
    const s = (await a.call("/api/sync")).data;
    expect(s.cellar).toEqual([]);
    expect(s.tastings[0].cellarId).toBeNull();
  });

  it("brings down the critics' window for wines in my cellar", async () => {
    const c = await signIn();
    const v = vintageOp();
    await c.ops([v, { op: "putCellar", lot: lot(v.id, { drinkFrom: null, drinkTo: null }) }]);
    const id = (await c.call("/api/sync")).data.cellar[0].vintageId;
    await env.DB.prepare(
      "INSERT INTO pro_reviews (vintage_id, status, data, started_at, fetched_at) VALUES (?, 'done', ?, ?, ?)",
    )
      .bind(id, JSON.stringify({ drinkWindow: "2027-2045" }), "2026-11-01", "2026-11-01")
      .run();
    const s = (await c.call("/api/sync")).data;
    expect(s.proWindows).toEqual([{ vintageId: id, from: 2027, to: 2045, text: "2027-2045" }]);
  });
});

describe("drinking window", () => {
  it("reads the ways critics write it", () => {
    expect(parseWindow("2027-2045")).toEqual({ from: 2027, to: 2045 });
    expect(parseWindow("2027–2045")).toEqual({ from: 2027, to: 2045 });
    expect(parseWindow("2030+")).toEqual({ from: 2030, to: null });
    expect(parseWindow("now-2035")).toEqual({ from: null, to: 2035 });
    expect(parseWindow("through 2035")).toEqual({ from: null, to: 2035 });
    expect(parseWindow("drink now")).toBeNull();
    expect(parseWindow(null)).toBeNull();
  });

  it("goes by mine, then the critics', then my notes", () => {
    const pro = { vintageId: "v", from: 2027, to: 2045, text: "" };
    const notes = [{ vintageId: "v", tastedAt: "2026-01-01", extra: { drinkFrom: 2030, drinkTo: 2050 } }];
    expect(windowOf({ vintageId: "v", drinkFrom: 2026, drinkTo: null }, pro, notes)).toMatchObject({
      from: 2026,
      source: "mine",
    });
    expect(windowOf({ vintageId: "v", drinkFrom: null, drinkTo: null }, pro, notes)?.source).toBe("critics");
    expect(windowOf({ vintageId: "v", drinkFrom: null, drinkTo: null }, undefined, notes)?.source).toBe("notes");
    expect(windowOf({ vintageId: "v", drinkFrom: null, drinkTo: null }, undefined, [])).toBeNull();
  });

  it("says where a lot stands this year", () => {
    const w = (from: number | null, to: number | null) => ({ from, to, source: "mine" as const });
    expect(windowStatus(w(2020, 2025), 2026)).toBe("past");
    expect(windowStatus(w(2020, 2026), 2026)).toBe("last");
    expect(windowStatus(w(2024, 2030), 2026)).toBe("ready");
    expect(windowStatus(w(null, 2030), 2026)).toBe("ready");
    expect(windowStatus(w(2028, 2040), 2026)).toBe("wait");
    expect(windowStatus(null, 2026)).toBe("unknown");
    expect(windowLabel({ from: 2027, to: 2045 }, "en")).toBe("2027–2045");
    expect(windowLabel({ from: 2030, to: null }, "zh-CN")).toBe("2030 起");
  });

  it("reminds once per bottle and year: entering, last year, past", () => {
    const lots = [
      lot("a", { drinkFrom: 2026, drinkTo: 2035 }),
      lot("b", { drinkFrom: 2018, drinkTo: 2026 }),
      lot("c", { drinkFrom: 2015, drinkTo: 2020 }),
      lot("d", { drinkFrom: 2020, drinkTo: 2035 }),
      lot("e", { drinkFrom: 2015, drinkTo: 2020, qty: 0 }),
    ];
    const alerts = cellarAlerts(lots, [], [], 2026);
    expect(alerts.map((a) => [a.lot.vintageId, a.kind])).toEqual([
      ["a", "entering"],
      ["b", "last"],
      ["c", "past"],
    ]);
    expect(alerts[0]!.key).toBe(`${lots[0]!.id}:entering:2026`);
  });
});
