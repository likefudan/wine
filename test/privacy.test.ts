import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { type Board, type ListItem, type WineList, ulid } from "../src/shared/model";
import { Client, signIn, tasting, vintageOp } from "./helpers";

async function sharedList(owner: Client) {
  const at = new Date().toISOString();
  const list: WineList = {
    id: ulid(),
    title: "Privacy day",
    kind: "trip",
    startsOn: null,
    place: null,
    note: null,
    createdAt: at,
    updatedAt: at,
  };
  const wine = vintageOp({ producer: "Privacy Estate", wine: "Rouge" });
  const item: ListItem = {
    id: ulid(),
    listId: list.id,
    vintageId: wine.id,
    position: 0,
    priceUsd: null,
    createdAt: at,
  };
  await owner.ops([{ op: "putList", list }, wine, { op: "putItem", item }]);
  const key = (await owner.call<Board>(`/api/lists/${list.id}/board`)).data.key!;
  return { list, wine, item, key };
}

describe("privacy", () => {
  it("deletes an account and everything of it, keeping others' notes", async () => {
    const host = await signIn("leaving-host@example.com");
    const friend = await signIn("staying-friend@example.com");
    const { list, wine, item, key } = await sharedList(host);
    await friend.call(`/api/lists/${list.id}/join`, { k: key });
    const friendNote = tasting(wine.id, { listItemId: item.id, score: 90 });
    await friend.ops([{ op: "putTasting", tasting: friendNote }]);
    await host.ops([{ op: "putTasting", tasting: tasting(wine.id, { listItemId: item.id, score: 85 }) }]);

    expect((await host.call("/api/me/delete", {})).status).toBe(400);
    expect((await host.call("/api/me/delete", { confirm: true })).status).toBe(200);
    expect((await host.call("/api/sync")).status).toBe(401);
    const left = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE email = 'leaving-host@example.com'",
    ).first<{
      n: number;
    }>();
    expect(left?.n).toBe(0);
    expect(await env.DB.prepare("SELECT 1 FROM lists WHERE id = ?").bind(list.id).first()).toBeNull();
    // The friend's note stays in their own 酒库, outside the deleted 品鉴.
    const s = (await friend.call("/api/sync")).data;
    expect(s.tastings).toHaveLength(1);
    expect(s.tastings[0].listItemId).toBeNull();
    expect(s.lists).toHaveLength(0);
  });

  it("changes the QR code when the host takes someone out", async () => {
    const host = await signIn("qr-host@example.com");
    const guest = await signIn("qr-guest@example.com");
    const { list, key } = await sharedList(host);
    const joined = await guest.call<Board>(`/api/lists/${list.id}/join`, { k: key });
    const guestId = joined.data.members.find((m) => !m.owner)!.id;
    await host.call(`/api/lists/${list.id}/members/${guestId}/remove`, {});
    const again = await guest.call(`/api/lists/${list.id}/join`, { k: key });
    expect(again.status).toBe(403);
  });

  it("shows a visitor with only a public link no part of anyone's email", async () => {
    const host = await signIn("nameless-host@example.com");
    const { list } = await sharedList(host);
    await host.call(`/api/lists/${list.id}/share`, { visibility: "public", blind: false });
    await env.DB.prepare(
      "UPDATE users SET name = NULL, nickname = NULL WHERE email = 'nameless-host@example.com'",
    ).run();
    const visitor = await new Client().call<Board>(`/api/lists/${list.id}/board`);
    expect(visitor.status).toBe(200);
    expect(JSON.stringify(visitor.data)).not.toContain("nameless-host");
  });

  it("forgets a label photo once no note uses it", async () => {
    const c = await signIn("photos@example.com");
    const me = (await c.call("/api/sync")).data.me;
    const photoId = ulid();
    await env.DB.prepare(
      "INSERT INTO photos (id, user_id, r2_key, kind, created_at) VALUES (?, ?, 'x.jpg', 'label', ?)",
    )
      .bind(photoId, me.id, new Date().toISOString())
      .run();
    const v = vintageOp({ producer: "Photo Estate" });
    const t = tasting(v.id, { photoId });
    await c.ops([v, { op: "putTasting", tasting: t }]);
    await c.ops([{ op: "deleteTasting", id: t.id }]);
    expect(await env.DB.prepare("SELECT 1 FROM photos WHERE id = ?").bind(photoId).first()).toBeNull();
  });
});
