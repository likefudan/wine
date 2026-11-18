import { describe, expect, it } from "vitest";
import { type Board, type FriendFeed, type ListItem, type WineList, ulid } from "../src/shared/model";
import { Client, signIn, tasting, vintageOp } from "./helpers";

async function sharedList(owner: Client, title: string, n = 2) {
  const at = new Date().toISOString();
  const list: WineList = {
    id: ulid(),
    title,
    kind: "winery",
    startsOn: null,
    place: null,
    note: null,
    createdAt: at,
    updatedAt: at,
  };
  const wines = Array.from({ length: n }, (_, k) => vintageOp({ wine: `${title} wine ${k}`, year: 2019 + k }));
  const items: ListItem[] = wines.map((w, k) => ({
    id: ulid(),
    listId: list.id,
    vintageId: w.id,
    position: k,
    priceUsd: null,
    createdAt: at,
  }));
  await owner.ops([{ op: "putList", list }, ...wines, ...items.map((item) => ({ op: "putItem" as const, item }))]);
  const key = (await owner.call<Board>(`/api/lists/${list.id}/board`)).data.key!;
  return { list, wines, items, key };
}

const feed = (c: Client, q = "") => c.call<FriendFeed>(`/api/friends${q}`);
const later = (s: number) => new Date(Date.now() + s * 1000).toISOString();

describe("朋友动态", () => {
  it("shows friends' notes in shared 品鉴, keeps 盲评, and never their private notes or where they tasted", async () => {
    const owner = await signIn("feed-owner@example.com");
    const friend = await signIn("feed-friend@example.com");
    const { list, wines, items, key } = await sharedList(owner, "Napa");
    expect((await friend.call(`/api/lists/${list.id}/join`, { k: key })).status).toBe(200);

    // Before anyone writes anything: empty, and signed-out visitors get nothing.
    expect((await feed(owner)).data).toEqual({ notes: [], next: null });
    expect((await feed(new Client())).status).toBe(401);

    // The friend rates both wines; one note has where it was tasted. And one wine at home, alone.
    const home = vintageOp({ wine: "Private bottle" });
    await friend.ops([
      home,
      {
        op: "putTasting",
        tasting: tasting(wines[0]!.id, {
          listItemId: items[0]!.id,
          score: 94,
          note: "cassis",
          updatedAt: later(1),
          location: {
            name: "Secret cellar",
            address: "1 Hidden Rd",
            lat: 38.4,
            lng: -122.4,
            accuracy: 10,
            placeId: null,
            geocoded: true,
          },
        }),
      },
      {
        op: "putTasting",
        tasting: tasting(wines[1]!.id, { listItemId: items[1]!.id, score: 90, updatedAt: later(2) }),
      },
      { op: "putTasting", tasting: tasting(home.id, { score: 99, note: "just mine", updatedAt: later(3) }) },
      // Opened but nothing written: not handed in, not news.
      {
        op: "putTasting",
        tasting: tasting(wines[1]!.id, {
          listItemId: null,
          score: null,
          note: null,
          descriptors: [],
          updatedAt: later(4),
        }),
      },
    ]);

    const blind = (await feed(owner)).data;
    expect(blind.notes.map((n) => n.vintage.wine)).toEqual(["Napa wine 1", "Napa wine 0"]);
    // 盲评: they rated it, nothing more, until I hand in mine.
    expect(blind.notes[0]).toMatchObject({
      open: false,
      score: null,
      note: null,
      descriptors: [],
      depth: null,
      user: { name: "feed-friend" },
      list: { id: list.id, title: "Napa" },
    });
    expect(JSON.stringify(blind)).not.toMatch(/Secret cellar|Hidden Rd|Private bottle|just mine/);

    await owner.ops([
      {
        op: "putTasting",
        tasting: tasting(wines[0]!.id, { listItemId: items[0]!.id, score: 92, updatedAt: later(5) }),
      },
    ]);
    const after = (await feed(owner)).data;
    // My own note is not in my friends' feed.
    expect(after.notes).toHaveLength(2);
    const opus = after.notes.find((n) => n.vintage.wine === "Napa wine 0")!;
    expect(opus).toMatchObject({ open: true, score: 94, note: "cassis", descriptors: ["blackcurrant"] });
    expect(after.notes.find((n) => n.vintage.wine === "Napa wine 1")!.open).toBe(false);
    expect(JSON.stringify(after)).not.toMatch(/Secret cellar|Hidden Rd|location/);

    // The friend sees mine, open because they handed theirs in first.
    const theirs = (await feed(friend)).data;
    expect(theirs.notes).toHaveLength(1);
    expect(theirs.notes[0]).toMatchObject({ open: true, score: 92, user: { name: "feed-owner" } });

    // One wine only, for the wine page.
    const one = (await feed(owner, `?vintage=${wines[1]!.id}`)).data;
    expect(one.notes.map((n) => n.vintage.wine)).toEqual(["Napa wine 1"]);
    expect((await feed(owner, "?vintage=nope")).status).toBe(400);

    // 揭晓 opens the rest.
    await owner.call(`/api/lists/${list.id}/share`, { revealed: true });
    expect((await feed(owner)).data.notes.every((n) => n.open)).toBe(true);

    // Someone not in the list sees none of it.
    const stranger = await signIn("feed-stranger@example.com");
    expect((await feed(stranger)).data.notes).toEqual([]);

    // Once the friend leaves, their notes leave the feed with them.
    await friend.call(`/api/lists/${list.id}/leave`, {});
    expect((await feed(owner)).data.notes).toEqual([]);
  });

  it("pages through older notes without repeats", async () => {
    const owner = await signIn("page-owner@example.com");
    const friend = await signIn("page-friend@example.com");
    const { list, wines, items, key } = await sharedList(owner, "Long day", 25);
    await friend.call(`/api/lists/${list.id}/join`, { k: key });
    await owner.call(`/api/lists/${list.id}/share`, { blind: false });
    // All written the same second: the id breaks the tie.
    const at = later(10);
    await friend.ops(
      wines.map((w, k) => ({
        op: "putTasting" as const,
        tasting: tasting(w.id, { listItemId: items[k]!.id, updatedAt: at }),
      })),
    );
    const first = (await feed(owner)).data;
    expect(first.notes).toHaveLength(20);
    expect(first.next).toBeTruthy();
    const second = (await feed(owner, `?before=${encodeURIComponent(first.next!)}`)).data;
    expect(second.notes).toHaveLength(5);
    expect(second.next).toBeNull();
    const ids = [...first.notes, ...second.notes].map((n) => n.id);
    expect(new Set(ids).size).toBe(25);
    expect((await feed(owner, "?before=junk")).status).toBe(400);
  });
});
