import { describe, expect, it } from "vitest";
import { type Board, type Me, type Member, type WineList, checkNickname, ulid } from "../src/shared/model";
import { Client, signIn, tasting, vintageOp } from "./helpers";

// A tiny valid JPEG start (FF D8) is all the server checks; the phone sends a real 256×256 one.
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4));
const me = async (c: Client) => (await c.call<{ me: Me }>("/api/auth/session")).data.me!;

describe("昵称和头像", () => {
  it("lets a person pick their own name, and go back to Google's by leaving it empty", async () => {
    const c = await signIn("nick@example.com");
    const before = await me(c);
    expect(before.nickname).toBeNull();
    expect(before.avatarMode).toBe("google");

    let r = await c.call<{ me: Me }>("/api/me/name", { name: "  品酒小王  " });
    expect(r.status).toBe(200);
    expect(r.data.me.name).toBe("品酒小王");
    expect(r.data.me.nickname).toBe("品酒小王");
    expect((await me(c)).name).toBe("品酒小王");

    for (const bad of ["😀wine", "a".repeat(21), "...", "a\nb"]) {
      r = await c.call("/api/me/name", { name: bad });
      expect(r.status, bad).toBe(400);
    }
    expect((await c.call("/api/me/name", {})).status).toBe(400);

    r = await c.call<{ me: Me }>("/api/me/name", { name: "" });
    expect(r.data.me.nickname).toBeNull();
    expect(r.data.me.name).toBe(before.name);
  });

  it("checks names like the badminton site, but for any language", () => {
    for (const ok of ["José Ruiz", "정민", "王小明", "Anne-Marie", "O'Neil", "Dr. Who (2)", "山田・太郎"])
      expect(checkNickname(ok), ok).toBeNull();
    for (const bad of ["_x", "a  b", "x😀", "<b>"]) expect(checkNickname(bad), bad).not.toBeNull();
  });

  it("stores an uploaded photo, serves it cacheable, and replaces or drops it", async () => {
    const c = await signIn("photo@example.com");
    expect((await c.call("/api/me/avatar", { image: btoa("not a jpeg") })).status).toBe(400);
    expect((await c.call("/api/me/avatar", { image: "%%%" })).status).toBe(400);

    let r = await c.call<{ me: Me }>("/api/me/avatar", { image: JPEG });
    expect(r.status).toBe(200);
    expect(r.data.me.avatarMode).toBe("own");
    const first = r.data.me.picture!;
    expect(first).toMatch(/^\/api\/avatars\//);

    const { exports } = await import("cloudflare:workers");
    const img = await exports.default.fetch(`https://wine.test${first}`);
    expect(img.status).toBe(200);
    expect(img.headers.get("Content-Type")).toBe("image/jpeg");
    expect(img.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await img.arrayBuffer())[0]).toBe(0xff);

    r = await c.call<{ me: Me }>("/api/me/avatar", { image: JPEG });
    expect(r.data.me.picture).not.toBe(first);
    expect((await exports.default.fetch(`https://wine.test${first}`)).status).toBe(404);

    r = await c.call<{ me: Me }>("/api/me/avatar/mode", { mode: "none" });
    expect(r.data.me.avatarMode).toBe("none");
    expect(r.data.me.picture).toBeNull();
    r = await c.call<{ me: Me }>("/api/me/avatar/mode", { mode: "google" });
    expect(r.data.me.avatarMode).toBe("google");
    expect((await c.call("/api/me/avatar/mode", { mode: "x" })).status).toBe(400);
    expect((await new Client().call("/api/me/name", { name: "x" })).status).toBe(401);
  });

  it("shows the chosen name and photo to friends in a shared 品鉴 and to the owner's 成员 list", async () => {
    const owner = await signIn("owner@example.com");
    const friend = await signIn("pal@example.com");
    await friend.call("/api/me/name", { name: "Pal" });
    const pic = (await friend.call<{ me: Me }>("/api/me/avatar", { image: JPEG })).data.me.picture;

    const at = new Date().toISOString();
    const list: WineList = {
      id: ulid(),
      title: "Tasting",
      kind: "winery",
      startsOn: null,
      place: null,
      note: null,
      createdAt: at,
      updatedAt: at,
    };
    const w = vintageOp();
    const itemId = ulid();
    await owner.ops([
      { op: "putList", list },
      w,
      {
        op: "putItem",
        item: { id: itemId, listId: list.id, vintageId: w.id, position: 0, priceUsd: null, createdAt: at },
      },
    ]);
    await owner.call("/api/me/name", { name: "Host" });
    const key = (await owner.call<Board>(`/api/lists/${list.id}/board`)).data.key!;
    expect((await friend.call(`/api/lists/${list.id}/join`, { k: key })).status).toBe(200);
    await friend.ops([{ op: "putTasting", tasting: tasting(w.id, { listItemId: itemId, score: 90 }) }]);

    const board = (await friend.call<Board>(`/api/lists/${list.id}/board`)).data;
    expect(board.list.ownerName).toBe("Host");
    expect(board.members.find((m) => m.name === "Pal")?.picture).toBe(pic);
    expect(board.items[0]!.notes[0]).toMatchObject({ name: "Pal", picture: pic });

    const members = (await owner.call<{ members: Member[] }>("/api/members")).data.members;
    expect(members.find((m) => m.email === "pal@example.com")).toMatchObject({ name: "Pal", picture: pic });
  });
});
