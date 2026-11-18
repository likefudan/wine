import { Hono } from "hono";
import { BLIND, cleanBlind } from "../shared/blind";
import {
  type Board,
  type BoardItem,
  type BoardNote,
  type Depth,
  type Guesses,
  ID_RE,
  type ListKind,
  VISIBILITIES,
  type Visibility,
} from "../shared/model";
import { type UserRow, currentUser, requireSameOrigin, requireUser } from "./auth";
import { VINTAGE_SELECT, type VintageRow, vintageInfo } from "./data";
import type { Env } from "./env";
import { HttpError, now, randomToken, readJson, timingSafeEqual } from "./http";
import { NAME_SQL, PICTURE_SQL } from "./profile";

/**
 * 分享与共同评价 (docs/design.zh.md §3.6). A list's QR code holds /l/{list id}?k={key}: scanning it
 * and signing in makes you a member, who adds wines and writes their own note on each. 盲评 is
 * enforced here, not on the phone: until I hand in my note on a wine, nothing of anyone else's note
 * on it leaves the server, only how many have rated it. Visitors who have not joined see the notes
 * only once the owner reveals them (揭晓) or turns 盲评 off, so a private window cannot peek.
 */

type DB = D1Database;

interface ListRow {
  id: string;
  owner_id: string;
  title: string;
  kind: string;
  starts_on: string | null;
  note: string | null;
  place_name: string | null;
  place_id: string | null;
  place_address: string | null;
  place_lat: number | null;
  place_lng: number | null;
  visibility: string;
  blind: number;
  revealed_at: string | null;
  share_key: string | null;
  join_open: number;
  owner_name: string | null;
}

const notFound = () => new HttpError(404, "not_found", "找不到这次品鉴");

async function loadList(db: DB, listId: string): Promise<ListRow> {
  if (!ID_RE.test(listId)) throw notFound();
  const l = await db
    .prepare(`SELECT l.*, ${NAME_SQL()} AS owner_name FROM lists l JOIN users u ON u.id = l.owner_id WHERE l.id = ?`)
    .bind(listId)
    .first<ListRow>();
  if (!l) throw notFound();
  return l;
}

const memberOf = async (db: DB, listId: string, userId: string) =>
  !!(await db.prepare("SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?").bind(listId, userId).first());

const keyOk = (l: ListRow, k: string | undefined | null) =>
  !!(l.share_key && typeof k === "string" && k.length <= 100 && timingSafeEqual(k, l.share_key));

/** Whether everyone's notes are open to everyone who can see the list. */
const notesOpen = (l: ListRow) => !l.blind || !!l.revealed_at;

/**
 * A note counts as handed in once it says anything: opening a wine starts an empty note, which must
 * neither unlock the others' notes nor show up as a rating.
 */
export const handedIn = (t: string) => `(${t}.score IS NOT NULL OR ${t}.note IS NOT NULL
  OR EXISTS (SELECT 1 FROM tasting_descriptors d WHERE d.tasting_id = ${t}.id))`;
const HANDED_IN = handedIn("t");

const parse = <T>(s: string | null): T => {
  try {
    return (s ? JSON.parse(s) : {}) as T;
  } catch {
    return {} as T;
  }
};

export const displayName = (name: string | null, email: string) => name?.trim() || email.split("@")[0]!;

export async function board(db: DB, l: ListRow, user: UserRow | null, k: string | null): Promise<Board> {
  const member = !!user && (await memberOf(db, l.id, user.id));
  const owner = !!user && user.id === l.owner_id;
  const viaKey = keyOk(l, k);
  if (!member && l.visibility !== "public" && !viaKey) {
    // Signed out, or not a member, with no key: a private list says nothing about itself.
    throw new HttpError(403, "private_list", "这次品鉴是私密的，请向创建者要二维码");
  }
  const open = notesOpen(l);
  // Someone without a name shows as the front of their email to the people they taste with, never
  // to a visitor who only has a public link (the page then says 品鉴者).
  const who = (name: string | null, email: string) => (member ? displayName(name, email) : name?.trim() || "");
  const [items, notes, descriptors, members] = await db.batch([
    db
      .prepare(`${VINTAGE_SELECT.replace("SELECT ", "SELECT i.id AS item_id, i.position, i.blind AS item_blind, ")}
        JOIN list_items i ON i.vintage_id = v.id WHERE i.list_id = ? ORDER BY i.position`)
      .bind(l.id),
    db
      .prepare(
        `SELECT t.id, t.user_id, t.list_item_id, t.depth, t.score, t.buy_again, t.appearance, t.nose, t.palate, t.note,
           t.guesses, t.price_usd,
           ${NAME_SQL()} AS name, u.email, ${PICTURE_SQL()} AS picture
         FROM tastings t JOIN users u ON u.id = t.user_id JOIN list_items i ON i.id = t.list_item_id
         WHERE i.list_id = ? AND (${HANDED_IN} OR (i.blind IS NOT NULL AND t.guesses NOT IN ('', '{}')))
         ORDER BY t.score IS NULL, t.score DESC, t.updated_at`,
      )
      .bind(l.id),
    db
      .prepare(
        `SELECT d.tasting_id, d.descriptor_id FROM tasting_descriptors d JOIN tastings t ON t.id = d.tasting_id
         JOIN list_items i ON i.id = t.list_item_id WHERE i.list_id = ? ORDER BY d.intensity DESC`,
      )
      .bind(l.id),
    db
      .prepare(
        `SELECT u.id, ${NAME_SQL()} AS name, u.email, ${PICTURE_SQL()} AS picture, m.role FROM list_members m JOIN users u ON u.id = m.user_id
         WHERE m.list_id = ? ORDER BY m.role = 'owner' DESC, m.joined_at`,
      )
      .bind(l.id),
  ]);
  type NoteRow = {
    id: string;
    user_id: string;
    list_item_id: string;
    depth: string;
    score: number | null;
    buy_again: number | null;
    appearance: string;
    nose: string;
    palate: string;
    note: string | null;
    guesses: string;
    price_usd: number | null;
    name: string | null;
    email: string;
    picture: string | null;
  };
  const words = new Map<string, string[]>();
  for (const d of descriptors!.results as { tasting_id: string; descriptor_id: string }[]) {
    const list = words.get(d.tasting_id) ?? [];
    list.push(d.descriptor_id);
    words.set(d.tasting_id, list);
  }
  const byItem = new Map<string, NoteRow[]>();
  for (const n of notes!.results as unknown as NoteRow[]) {
    const list = byItem.get(n.list_item_id) ?? [];
    list.push(n);
    byItem.set(n.list_item_id, list);
  }
  type ItemRow = VintageRow & { item_id: string; position: number; item_blind: string | null };
  const boardItems = (items!.results as unknown as ItemRow[]).map((r): BoardItem => {
    // 盲品: the wine stays hidden until the host reveals it, and so do the guesses on it.
    const hidden = r.id === BLIND;
    const blind = r.item_blind ? cleanBlind(parse(r.item_blind)) : null;
    const rows = byItem.get(r.item_id) ?? [];
    // Members see a wine's notes once they handed in their own; visitors only when they are open.
    const itemOpen = open || (member && rows.some((n) => n.user_id === user!.id));
    const scores = rows.map((n) => n.score).filter((s): s is number => s !== null);
    return {
      id: r.item_id,
      position: r.position,
      vintage: hidden ? null : vintageInfo(r),
      blind,
      rated: rows.length,
      open: itemOpen,
      avg: itemOpen && scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      notes: itemOpen
        ? rows.map(
            (n): BoardNote => ({
              userId: n.user_id,
              name: who(n.name, n.email),
              picture: n.picture,
              mine: n.user_id === user?.id,
              depth: n.depth as Depth,
              score: n.score,
              buyAgain: n.buy_again === null ? null : !!n.buy_again,
              appearance: parse(n.appearance),
              nose: parse(n.nose),
              palate: parse(n.palate),
              descriptors: words.get(n.id) ?? [],
              note: n.note,
              ...(blind && !hidden ? { guesses: parse<Guesses>(n.guesses), priceUsd: n.price_usd } : {}),
            }),
          )
        : [],
    };
  });
  const memberRows = members!.results as {
    id: string;
    name: string | null;
    email: string;
    picture: string | null;
    role: string;
  }[];
  let key = l.share_key;
  if (member && !key) {
    key = randomToken();
    await db.prepare("UPDATE lists SET share_key = ? WHERE id = ? AND share_key IS NULL").bind(key, l.id).run();
    key = (await db.prepare("SELECT share_key FROM lists WHERE id = ?").bind(l.id).first<{ share_key: string }>())!
      .share_key;
  }
  return {
    list: {
      id: l.id,
      title: l.title,
      kind: l.kind as ListKind,
      startsOn: l.starts_on,
      // Someone's home address is for the people in the list, not whoever opens a public link.
      place:
        member || l.kind !== "home"
          ? l.place_name || l.place_address
            ? {
                name: l.place_name ?? "",
                id: l.place_id,
                address: l.place_address,
                lat: l.place_lat,
                lng: l.place_lng,
              }
            : null
          : l.place_name
            ? { name: l.place_name, id: null, address: null, lat: null, lng: null }
            : null,
      note: l.note,
      ownerName: displayName(l.owner_name, ""),
      visibility: l.visibility as Visibility,
      blind: !!l.blind,
      revealedAt: l.revealed_at,
      joinOpen: !!l.join_open,
    },
    signedIn: !!user,
    member,
    owner,
    canJoin: !member && viaKey && !!l.join_open,
    key: member ? key : null,
    memberCount: memberRows.length,
    members:
      member || open
        ? memberRows.map((m) => ({
            id: m.id,
            name: who(m.name, m.email),
            picture: m.picture,
            owner: m.role === "owner",
          }))
        : [],
    items: boardItems,
  };
}

/** Takes a member out of a list; their notes stay in their own 酒库, outside the list. */
async function removeMember(db: DB, listId: string, userId: string) {
  await db.batch([
    db
      .prepare(
        "UPDATE tastings SET list_item_id = NULL WHERE user_id = ? AND list_item_id IN (SELECT id FROM list_items WHERE list_id = ?)",
      )
      .bind(userId, listId),
    db.prepare("DELETE FROM list_members WHERE list_id = ? AND user_id = ?").bind(listId, userId),
  ]);
}

export const sharingRoutes = new Hono<{ Bindings: Env }>();

/** The list, its wines and everyone's notes, as far as this person may see them. No sign-in needed. */
sharingRoutes.get("/lists/:id/board", async (c) => {
  const l = await loadList(c.env.DB, c.req.param("id"));
  return c.json(await board(c.env.DB, l, await currentUser(c), c.req.query("k") ?? null));
});

/** 扫码加入: the key from the QR code makes me a member. A friend new to the site starts at 入门. */
sharingRoutes.post("/lists/:id/join", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const db = c.env.DB;
  const l = await loadList(db, c.req.param("id"));
  if (!(await memberOf(db, l.id, user.id))) {
    const k = (await readJson(c.req.raw)).k;
    if (!keyOk(l, typeof k === "string" ? k : null))
      throw new HttpError(403, "bad_key", "二维码已失效，请向创建者要新的");
    if (!l.join_open) throw new HttpError(403, "join_closed", "这次品鉴已停止扫码加入");
    await db.batch([
      db
        .prepare("INSERT OR IGNORE INTO list_members (list_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
        .bind(l.id, user.id, now()),
      db.prepare("UPDATE users SET depth = 'beginner' WHERE id = ? AND depth IS NULL").bind(user.id),
    ]);
  }
  return c.json(await board(db, l, (await currentUser(c))!, null));
});

/** The owner's switches: 私密 / 公开, 盲评, 揭晓, 扫码加入, and a new QR code. */
sharingRoutes.post("/lists/:id/share", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const db = c.env.DB;
  const l = await loadList(db, c.req.param("id"));
  if (l.owner_id !== user.id) throw new HttpError(403, "not_owner", "只有品鉴的创建者能修改");
  const b = await readJson(c.req.raw);
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    values.push(v);
  };
  if (b.visibility !== undefined) {
    if (!(VISIBILITIES as readonly unknown[]).includes(b.visibility))
      throw new HttpError(400, "bad_request", "内容无效");
    put("visibility", b.visibility);
  }
  if (typeof b.blind === "boolean") put("blind", b.blind ? 1 : 0);
  if (typeof b.revealed === "boolean") put("revealed_at", b.revealed ? (l.revealed_at ?? now()) : null);
  // 揭晓 also gives each 盲品 glass the wine the host filled in, and everyone's note on it that wine.
  if (b.revealed === true)
    await db.batch([
      db
        .prepare(
          "UPDATE list_items SET vintage_id = answer_vintage_id WHERE list_id = ? AND vintage_id = ? AND answer_vintage_id IS NOT NULL",
        )
        .bind(l.id, BLIND),
      db
        .prepare(
          `UPDATE tastings SET vintage_id = (SELECT i.vintage_id FROM list_items i WHERE i.id = tastings.list_item_id)
           WHERE vintage_id = ? AND list_item_id IN (SELECT id FROM list_items WHERE list_id = ? AND vintage_id <> ?)`,
        )
        .bind(BLIND, l.id, BLIND),
    ]);
  if (typeof b.joinOpen === "boolean") put("join_open", b.joinOpen ? 1 : 0);
  if (b.newKey === true) put("share_key", randomToken());
  if (sets.length) {
    put("updated_at", now());
    await db
      .prepare(`UPDATE lists SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values, l.id)
      .run();
  }
  return c.json(await board(db, await loadList(db, l.id), user, null));
});

/** Leaving a list I joined. */
sharingRoutes.post("/lists/:id/leave", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const l = await loadList(c.env.DB, c.req.param("id"));
  if (l.owner_id === user.id) throw new HttpError(400, "owner", "创建者不能退出，可以删除品鉴");
  await removeMember(c.env.DB, l.id, user.id);
  return c.json({ ok: true });
});

/** The owner takes someone out of the list. */
sharingRoutes.post("/lists/:id/members/:user/remove", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const db = c.env.DB;
  const l = await loadList(db, c.req.param("id"));
  if (l.owner_id !== user.id) throw new HttpError(403, "not_owner", "只有品鉴的创建者能修改");
  if (c.req.param("user") === user.id) throw new HttpError(400, "owner", "创建者不能退出，可以删除品鉴");
  await removeMember(db, l.id, c.req.param("user"));
  // The QR code they scanned stops working, so they cannot simply scan it again.
  await db
    .prepare("UPDATE lists SET share_key = ?, updated_at = ? WHERE id = ?")
    .bind(randomToken(), now(), l.id)
    .run();
  return c.json(await board(db, await loadList(db, l.id), user, null));
});
