import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { BLIND, guessPlace, nextLabel, scoreGuess } from "../src/shared/blind";
import { type Board, type ListItem, type SyncData, type VintageInfo, type WineList, ulid } from "../src/shared/model";
import { type Client, signIn, tasting, vintageOp } from "./helpers";

const v = (over: Partial<VintageInfo> = {}): VintageInfo => ({
  id: ulid(),
  wineId: "",
  producer: "Château Léoville Barton",
  wine: "Saint-Julien",
  year: 2015,
  color: "red",
  country: "France",
  region: "Bordeaux",
  area: "Médoc",
  appellation: "Saint-Julien",
  grapes: ["Cabernet Sauvignon", "Merlot"],
  abv: null,
  ...over,
});

describe("盲品 scoring", () => {
  it("gives grape 4, place 4 by level, vintage 2 (1 a year off), out of 10", () => {
    const s = scoreGuess({ grape: "赤霞珠", country: "France", region: "Bordeaux", vintage: 2016 }, v(), 95);
    expect(s.grape.got).toBe(4);
    expect(s.place.got).toBe(2); // France, Bordeaux: 2 of 4 levels
    expect(s.vintage.got).toBe(1);
    expect(s.total).toBe(7);
    expect(s.price.ok).toBeNull();
    const all = scoreGuess(
      {
        grape: "Cabernet Sauvignon",
        country: "France",
        region: "Bordeaux",
        sub: "Saint-Julien",
        vintage: 2015,
        price: "50-100",
      },
      v(),
      95,
    );
    expect(all.total).toBe(10);
    expect(all.price.ok).toBe(true);
  });

  it("stops at the first wrong level and leaves out what the wine does not say", () => {
    expect(scoreGuess({ country: "Italy", region: "Bordeaux" }, v(), null).place.got).toBe(0);
    const nv = scoreGuess(
      { grape: "Chardonnay" },
      v({ year: 0, grapes: [], region: "Champagne", area: null, appellation: null }),
      null,
    );
    expect(nv.vintage.max).toBe(0);
    expect(nv.grape.max).toBe(0);
    expect(nv.total).toBe(0);
  });

  it("reads old free-text guesses and Chinese place names", () => {
    expect(guessPlace({ region: "波尔多" })).toMatchObject({ country: "France", region: "Bordeaux" });
    expect(guessPlace({ region: "France" })).toMatchObject({ country: "France", region: null });
    expect(guessPlace({ region: "Napa Valley" })).toMatchObject({
      country: "USA",
      region: "California",
      area: "Napa Valley",
    });
  });

  it("numbers glasses #1, #2… around labels already used", () => {
    expect(nextLabel([])).toBe("#1");
    expect(nextLabel(["#1", "#2"])).toBe("#3");
    expect(nextLabel(["#1", "left glass", "#5"])).toBe("#6");
  });
});

// test/setup.ts wipes every table before each test: put back the placeholder wine migration 0015 adds.
beforeEach(async () => {
  const m = (env.TEST_MIGRATIONS as { name: string; queries: string[] }[]).find((x) => x.name.includes("blind"))!;
  await env.DB.batch(m.queries.filter((q) => q.includes("INSERT OR IGNORE")).map((q) => env.DB.prepare(q)));
});

const sync = (c: Client) => c.call<SyncData>("/api/sync").then((r) => r.data);

describe("盲品 on the server", () => {
  it("keeps a glass on its own off every wine until 对答案, and never takes the answer back", async () => {
    const me = await signIn("blind-solo@example.com");
    const x = tasting(BLIND, { blind: { label: "#1", color: "red" }, guesses: { grape: "Merlot" }, score: 90 });
    expect((await me.ops([{ op: "putTasting", tasting: x }])).data.results[0]!.ok).toBe(true);
    let s = await sync(me);
    expect(s.tastings[0]).toMatchObject({ vintageId: BLIND, blind: { label: "#1", color: "red" } });
    expect(s.vintages.map((w) => w.id)).not.toContain(BLIND);
    // A blind note with no label is refused.
    expect((await me.ops([{ op: "putTasting", tasting: tasting(BLIND, { blind: null }) }])).data.results[0]!.ok).toBe(
      false,
    );

    const wine = vintageOp({ producer: "Château Pétrus", wine: "Pétrus", year: 2010, region: "Bordeaux" });
    await me.ops([
      wine,
      { op: "putTasting", tasting: { ...x, vintageId: wine.id, updatedAt: new Date().toISOString() } },
    ]);
    s = await sync(me);
    expect(s.tastings[0]).toMatchObject({ vintageId: wine.id, blind: { label: "#1" }, guesses: { grape: "Merlot" } });
    // A phone that had not heard sends the glass as blind again, later: the wine stays.
    await me.ops([
      { op: "putTasting", tasting: { ...x, note: "still", updatedAt: new Date(Date.now() + 1000).toISOString() } },
    ]);
    s = await sync(me);
    expect(s.tastings[0]).toMatchObject({ vintageId: wine.id, note: "still" });

    // The placeholder is no wine to look up or find.
    expect((await me.call(`/api/reviews/${BLIND}`)).status).toBe(404);
    const found = await me.call<{ wines: { wineId: string }[] }>("/api/catalog?q=blind");
    expect(found.data.wines.map((w) => w.wineId)).not.toContain(BLIND);
  });

  it("in a group: only the host adds glasses and sees the answers; 揭晓 gives everyone the wine", async () => {
    const host = await signIn("blind-host@example.com");
    const friend = await signIn("blind-friend@example.com");
    const at = new Date().toISOString();
    const list: WineList = {
      id: ulid(),
      title: "周五盲品局",
      kind: "home",
      startsOn: null,
      place: null,
      note: null,
      createdAt: at,
      updatedAt: at,
    };
    const glass = (n: number): ListItem => ({
      id: ulid(),
      listId: list.id,
      vintageId: BLIND,
      position: n,
      priceUsd: n === 0 ? 95 : null,
      createdAt: at,
      blind: { label: `#${n + 1}`, color: "red" },
    });
    const [g1, g2] = [glass(0), glass(1)];
    const r = await host.ops([
      { op: "putList", list },
      { op: "putItem", item: g1 },
      { op: "putItem", item: g2 },
    ]);
    expect(r.data.results.every((x) => x.ok)).toBe(true);
    const key = (await host.call<Board>(`/api/lists/${list.id}/board`)).data.key!;
    expect((await friend.call(`/api/lists/${list.id}/join`, { k: key })).status).toBe(200);

    // The friend cannot add a blind glass, nor relabel or answer the host's.
    const theirs = { ...glass(2), id: ulid() };
    expect((await friend.ops([{ op: "putItem", item: theirs }])).data.results[0]!.ok).toBe(false);

    // Both taste #1 and guess.
    await host.ops([
      {
        op: "putTasting",
        tasting: tasting(BLIND, { listItemId: g1.id, blind: g1.blind, guesses: { grape: "Merlot" }, score: 92 }),
      },
    ]);
    const fx = tasting(BLIND, {
      listItemId: g1.id,
      blind: g1.blind,
      guesses: { grape: "Cabernet Sauvignon", country: "France", region: "Bordeaux", vintage: 2015 },
      score: 94,
    });
    await friend.ops([{ op: "putTasting", tasting: fx }]);

    // The host fills in the answer: only the host is told.
    const answer = vintageOp({
      producer: "Château Léoville Barton",
      wine: "Saint-Julien",
      year: 2015,
      country: "France",
      region: "Bordeaux",
      appellation: "Saint-Julien",
      grapes: ["Cabernet Sauvignon", "Merlot"],
    });
    await host.ops([answer, { op: "putItem", item: { ...g1, answerVintageId: answer.id } }]);
    await friend.ops([{ op: "putItem", item: { ...g1, vintageId: answer.id, answerVintageId: null, blind: null } }]);
    const hs = await sync(host);
    expect(hs.items.find((i) => i.id === g1.id)).toMatchObject({ vintageId: BLIND, answerVintageId: answer.id });
    expect(hs.vintages.map((w) => w.id)).toContain(answer.id);
    const fs = await sync(friend);
    expect(fs.items.find((i) => i.id === g1.id)).toMatchObject({
      vintageId: BLIND,
      answerVintageId: null,
      blind: { label: "#1" },
    });
    expect(JSON.stringify(fs)).not.toContain("Barton");
    const before = (await friend.call<Board>(`/api/lists/${list.id}/board`)).data;
    expect(before.items[0]).toMatchObject({ vintage: null, blind: { label: "#1" } });
    expect(JSON.stringify(before)).not.toContain("Barton");
    expect(JSON.stringify(before)).not.toContain("guesses");

    // 揭晓.
    const after = (await host.call<Board>(`/api/lists/${list.id}/share`, { revealed: true })).data;
    expect(after.items[0]!.vintage?.producer).toBe("Château Léoville Barton");
    expect(after.items[1]!.vintage).toBeNull(); // #2 had no answer yet
    const theirNote = after.items[0]!.notes.find((n) => !n.mine)!;
    expect(theirNote.guesses).toMatchObject({ grape: "Cabernet Sauvignon" });
    // Grape 4, France · Bordeaux 2 of 4 levels, vintage 2.
    expect(scoreGuess(theirNote.guesses!, after.items[0]!.vintage!, null).total).toBe(8);
    const fs2 = await sync(friend);
    expect(fs2.tastings.find((x) => x.id === fx.id)).toMatchObject({ vintageId: answer.id, blind: { label: "#1" } });
    expect(fs2.items.find((i) => i.id === g1.id)!.vintageId).toBe(answer.id);
  });
});
