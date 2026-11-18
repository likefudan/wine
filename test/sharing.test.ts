import { describe, expect, it } from "vitest";
import { type Board, type ListItem, type WineList, ulid } from "../src/shared/model";
import { Client, signIn, tasting, vintageOp } from "./helpers";

/** A Napa day with three common wines, made by Ke Li's phone. */
async function napaDay(owner: Client) {
  const at = new Date().toISOString();
  const list: WineList = {
    id: ulid(),
    title: "Napa day 1",
    kind: "trip",
    startsOn: "2026-11-20",
    place: null,
    note: null,
    createdAt: at,
    updatedAt: at,
  };
  const wines = [
    vintageOp({ producer: "Opus One", wine: "Opus One", year: 2019, region: "Napa Valley" }),
    vintageOp({ producer: "Caymus Vineyards", wine: "Cabernet Sauvignon", year: 2021, region: "Napa Valley" }),
    vintageOp({
      producer: "Rombauer Vineyards",
      wine: "Chardonnay",
      year: 2023,
      color: "white",
      region: "Carneros",
      grapes: ["Chardonnay"],
    }),
  ];
  const items: ListItem[] = wines.map((w, n) => ({
    id: ulid(),
    listId: list.id,
    vintageId: w.id,
    position: n,
    priceUsd: null,
    createdAt: at,
  }));
  const r = await owner.ops([
    { op: "putList", list },
    ...wines,
    ...items.map((item) => ({ op: "putItem" as const, item })),
  ]);
  expect(r.data.results.every((x) => x.ok)).toBe(true);
  return { list, wines, items };
}

const boardOf = (c: Client, listId: string, k?: string) =>
  c.call<Board & { error?: string }>(`/api/lists/${listId}/board${k ? `?k=${encodeURIComponent(k)}` : ""}`);

describe("分享与共同评价", () => {
  it("a friend joins by the QR code and writes their own notes; 盲评 hides the others' until they hand in", async () => {
    const owner = await signIn("owner@example.com");
    const { list, wines, items } = await napaDay(owner);

    const mine = await boardOf(owner, list.id);
    expect(mine.status).toBe(200);
    expect(mine.data).toMatchObject({ member: true, owner: true, memberCount: 1 });
    expect(mine.data.list.blind).toBe(true);
    const key = mine.data.key!;
    expect(key).toMatch(/^[\w-]{40,}$/);
    // The same key every time, so the QR code can be shown again.
    expect((await boardOf(owner, list.id)).data.key).toBe(key);

    // The owner hands in a note on Opus One.
    await owner.ops([
      {
        op: "putTasting",
        tasting: tasting(wines[0]!.id, { listItemId: items[0]!.id, score: 95, note: "cassis, cedar" }),
      },
    ]);

    // Signed out, with no key: nothing.
    const stranger = new Client();
    expect((await boardOf(stranger, list.id)).status).toBe(403);
    // Signed out, with the key: the list and its wines, never a note.
    const peek = await boardOf(stranger, list.id, key);
    expect(peek.status).toBe(200);
    expect(peek.data).toMatchObject({ signedIn: false, member: false, canJoin: true, key: null });
    expect(peek.data.items.map((i) => i.vintage.producer)).toEqual([
      "Opus One",
      "Caymus Vineyards",
      "Rombauer Vineyards",
    ]);
    expect(peek.data.items[0]).toMatchObject({ rated: 1, open: false, avg: null, notes: [] });
    expect(JSON.stringify(peek.data)).not.toContain("cassis");

    // A newcomer signs in from the QR code and joins: 入门 by default.
    const friend = await signIn("friend@example.com");
    expect((await friend.call(`/api/lists/${list.id}/join`, { k: "wrong" })).status).toBe(403);
    const joined = await friend.call<Board>(`/api/lists/${list.id}/join`, { k: key });
    expect(joined.status).toBe(200);
    expect(joined.data).toMatchObject({ member: true, owner: false, memberCount: 2 });
    expect((await friend.call("/api/auth/session")).data.me.depth).toBe("beginner");
    const sync = (await friend.call("/api/sync")).data;
    expect(sync.lists.map((l: WineList) => [l.id, l.ownerId, l.members])).toEqual([
      [list.id, sync.lists[0].ownerId, 2],
    ]);
    expect(sync.items).toHaveLength(3);

    // Before handing in: only the count.
    let b = (await boardOf(friend, list.id)).data;
    expect(b.items[0]).toMatchObject({ rated: 1, open: false, notes: [] });

    // Opening a wine starts an empty note: that unlocks nothing.
    await friend.ops([
      {
        op: "putTasting",
        tasting: tasting(wines[0]!.id, { listItemId: items[0]!.id, score: null, note: null, descriptors: [] }),
      },
    ]);
    b = (await boardOf(friend, list.id)).data;
    expect(b.items[0]).toMatchObject({ rated: 1, open: false });

    // Handing in a score opens that wine only.
    const fx = (await friend.call("/api/sync")).data.tastings[0];
    await friend.ops([{ op: "putTasting", tasting: { ...fx, score: 89, updatedAt: new Date().toISOString() } }]);
    b = (await boardOf(friend, list.id)).data;
    expect(b.items[0]).toMatchObject({ rated: 2, open: true, avg: 92 });
    expect(b.items[0]!.notes.map((n) => [n.score, n.mine])).toEqual([
      [95, false],
      [89, true],
    ]);
    expect(b.items[0]!.notes[0]!.descriptors).toEqual(["blackcurrant"]);
    expect(b.items[1]).toMatchObject({ rated: 0, open: false });

    // The friend adds a wine to the list; only the owner changes the list itself.
    const frogs = vintageOp({ producer: "Frog's Leap", wine: "Zinfandel", year: 2022, region: "Napa Valley" });
    const added = await friend.ops([
      frogs,
      {
        op: "putItem",
        item: { id: ulid(), listId: list.id, vintageId: frogs.id, position: 3, priceUsd: null, createdAt: "" },
      },
      { op: "putList", list: { ...list, title: "mine now" } },
    ]);
    expect(added.data.results.map((r) => r.ok)).toEqual([true, true, false]);
    expect((await owner.call("/api/sync")).data.items).toHaveLength(4);

    // Only the owner flips the switches.
    expect((await friend.call(`/api/lists/${list.id}/share`, { blind: false })).status).toBe(403);
  });

  it("the owner reveals, makes it public, and a new QR code shuts the old one", async () => {
    const owner = await signIn("owner@example.com");
    const { list, wines, items } = await napaDay(owner);
    const key = (await boardOf(owner, list.id)).data.key!;
    await owner.ops([
      { op: "putTasting", tasting: tasting(wines[1]!.id, { listItemId: items[1]!.id, score: 91, note: "big, jammy" }) },
    ]);

    // Public: anyone with the link sees the wines, but the notes wait for 揭晓.
    const s = await owner.call<Board>(`/api/lists/${list.id}/share`, { visibility: "public" });
    expect(s.data.list.visibility).toBe("public");
    const visitor = new Client();
    let v = (await boardOf(visitor, list.id)).data;
    expect(v).toMatchObject({ canJoin: false, members: [] });
    expect(v.items[1]).toMatchObject({ rated: 1, open: false });

    await owner.call(`/api/lists/${list.id}/share`, { revealed: true });
    v = (await boardOf(visitor, list.id)).data;
    expect(v.items[1]).toMatchObject({ open: true, avg: 91 });
    expect(v.items[1]!.notes[0]!.note).toBe("big, jammy");
    expect(v.members.map((m) => m.owner)).toEqual([true]);

    // A new key: the old QR code no longer lets anyone in.
    const fresh = (await owner.call<Board>(`/api/lists/${list.id}/share`, { newKey: true })).data.key;
    expect(fresh).not.toBe(key);
    const late = await signIn("late@example.com");
    expect((await late.call(`/api/lists/${list.id}/join`, { k: key })).status).toBe(403);
    // Joining switched off: even the new code is refused.
    await owner.call(`/api/lists/${list.id}/share`, { joinOpen: false });
    const closed = await late.call(`/api/lists/${list.id}/join`, { k: fresh });
    expect([closed.status, closed.data.error]).toEqual([403, "join_closed"]);
    await owner.call(`/api/lists/${list.id}/share`, { joinOpen: true });
    expect((await late.call(`/api/lists/${list.id}/join`, { k: fresh })).status).toBe(200);
  });

  it("a public home tasting shows visitors the home's name, not its address", async () => {
    const owner = await signIn("home@example.com");
    const { list } = await napaDay(owner);
    const place = { name: "小王家", id: null, address: "123 Main St, Palo Alto, CA", lat: null, lng: null };
    await owner.ops([{ op: "putList", list: { ...list, kind: "home", place } }]);
    await owner.call(`/api/lists/${list.id}/share`, { visibility: "public" });
    expect((await boardOf(owner, list.id)).data.list.place).toMatchObject(place);
    expect((await boardOf(new Client(), list.id)).data.list.place).toEqual({
      name: "小王家",
      id: null,
      address: null,
      lat: null,
      lng: null,
    });
  });

  it("a member who leaves or is removed keeps their notes in their own 酒库", async () => {
    const owner = await signIn("owner@example.com");
    const { list, wines, items } = await napaDay(owner);
    const key = (await boardOf(owner, list.id)).data.key!;
    const friend = await signIn("friend@example.com");
    await friend.call(`/api/lists/${list.id}/join`, { k: key });
    await friend.ops([{ op: "putTasting", tasting: tasting(wines[2]!.id, { listItemId: items[2]!.id, score: 88 }) }]);
    const friendId = (await friend.call("/api/auth/session")).data.me.id;
    const after = await owner.call<Board>(`/api/lists/${list.id}/members/${friendId}/remove`, {});
    expect(after.data.memberCount).toBe(1);
    const sync = (await friend.call("/api/sync")).data;
    expect(sync.lists).toEqual([]);
    expect(sync.tastings.map((t: { score: number; listItemId: string | null }) => [t.score, t.listItemId])).toEqual([
      [88, null],
    ]);
    expect((await boardOf(friend, list.id)).status).toBe(403);
    expect((await owner.call(`/api/lists/${list.id}/leave`, {})).status).toBe(400);
  });

  it("never shows where someone tasted on the board", async () => {
    const owner = await signIn("owner@example.com");
    const { list, wines, items } = await napaDay(owner);
    await owner.call(`/api/lists/${list.id}/share`, { visibility: "public", blind: false });
    const t = tasting(wines[0]!.id, {
      listItemId: items[0]!.id,
      location: {
        lat: 38.4,
        lng: -122.4,
        accuracy: 5,
        name: "Secret Spot",
        address: "1 Hidden Rd",
        placeId: null,
        geocoded: true,
      },
    });
    expect((await owner.ops([{ op: "putTasting", tasting: t }])).data.results[0]!.ok).toBe(true);
    const board = JSON.stringify((await boardOf(owner, list.id)).data);
    expect(board).toContain(items[0]!.id);
    expect(board).not.toContain("Secret Spot");
    expect(board).not.toContain("38.4");
  });
});
