import { Hono } from "hono";
import { BLIND } from "../shared/blind";
import { type FriendFeed, type FriendNote, ID_RE, toDepth } from "../shared/model";
import { requireUser } from "./auth";
import { NAME_SQL, PICTURE_SQL } from "./profile";
import { VINTAGE_SELECT, type VintageRow, vintageInfo } from "./data";
import type { Env } from "./env";
import { HttpError } from "./http";
import { displayName, handedIn } from "./sharing";

/**
 * 朋友动态: the notes my friends handed in on wines in the 品鉴 we share, newest first. A friend is
 * anyone in a 品鉴 with me; what they record on their own, outside a shared 品鉴, stays private.
 * Nothing here goes past what each list's board already shows me: a wine I have not handed in my own
 * note on, in a list still under 盲评, comes back as "they rated it" and no more. Where a note was
 * written (tastings.location) is never read.
 */

export const FEED_PAGE = 20;

interface Row {
  id: string;
  user_id: string;
  list_item_id: string;
  depth: string;
  score: number | null;
  buy_again: number | null;
  note: string | null;
  updated_at: string;
  name: string | null;
  email: string;
  picture: string | null;
  list_id: string;
  title: string;
  blind: number;
  revealed_at: string | null;
  vintage_id: string;
  mine_in: number;
}

export async function friendFeed(
  db: D1Database,
  userId: string,
  opts: { before?: string | null; vintage?: string | null; limit?: number } = {},
): Promise<FriendFeed> {
  const limit = Math.min(Math.max(opts.limit ?? FEED_PAGE, 1), 50);
  // 盲品 glasses not revealed yet: nobody is told what they are, so they are not news.
  const where: string[] = ["i.vintage_id <> ?"];
  const binds: unknown[] = [BLIND];
  if (opts.before) {
    // "<at>|<id>": the last note of the page before; (at, id) is unique, so nothing repeats or drops.
    const [at, id] = opts.before.split("|");
    if (!at || !id || !ID_RE.test(id) || at.length > 40) throw new HttpError(400, "bad_request", "内容无效");
    where.push("(t.updated_at < ? OR (t.updated_at = ? AND t.id < ?))");
    binds.push(at, at, id);
  }
  if (opts.vintage) {
    if (!ID_RE.test(opts.vintage)) throw new HttpError(400, "bad_request", "内容无效");
    // The phone may still know the wine by an id that turned out to be a duplicate.
    where.push("i.vintage_id = COALESCE((SELECT vintage_id FROM vintage_aliases WHERE alias_id = ?), ?)");
    binds.push(opts.vintage, opts.vintage);
  }
  const rows = (
    await db
      .prepare(
        `SELECT t.id, t.user_id, t.list_item_id, t.depth, t.score, t.buy_again, t.note, t.updated_at,
           ${NAME_SQL()} AS name, u.email, ${PICTURE_SQL()} AS picture, l.id AS list_id, l.title, l.blind, l.revealed_at, i.vintage_id,
           EXISTS (SELECT 1 FROM tastings m WHERE m.list_item_id = t.list_item_id AND m.user_id = ?1
             AND ${handedIn("m")}) AS mine_in
         FROM tastings t
         JOIN list_items i ON i.id = t.list_item_id
         JOIN lists l ON l.id = i.list_id
         JOIN list_members me ON me.list_id = l.id AND me.user_id = ?1
         JOIN list_members them ON them.list_id = l.id AND them.user_id = t.user_id
         JOIN users u ON u.id = t.user_id
         WHERE t.user_id != ?1 AND u.status != 'disabled' AND ${handedIn("t")}
           ${where.map((w) => `AND ${w}`).join(" ")}
         ORDER BY t.updated_at DESC, t.id DESC LIMIT ${limit + 1}`,
      )
      .bind(userId, ...binds)
      .all<Row>()
  ).results;
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  if (!page.length) return { notes: [], next: null };

  const open = (r: Row) => !r.blind || !!r.revealed_at || !!r.mine_in;
  const openIds = page.filter(open).map((r) => r.id);
  const vintageIds = [...new Set(page.map((r) => r.vintage_id))];
  const [vintages, descriptors] = await db.batch([
    db.prepare(`${VINTAGE_SELECT} WHERE v.id IN (${vintageIds.map(() => "?").join(",")})`).bind(...vintageIds),
    db
      .prepare(
        `SELECT tasting_id, descriptor_id FROM tasting_descriptors
         WHERE tasting_id IN (${openIds.length ? openIds.map(() => "?").join(",") : "NULL"})
         ORDER BY intensity DESC`,
      )
      .bind(...openIds),
  ]);
  const vById = new Map((vintages!.results as unknown as VintageRow[]).map((v) => [v.id, vintageInfo(v)]));
  const words = new Map<string, string[]>();
  for (const d of descriptors!.results as { tasting_id: string; descriptor_id: string }[]) {
    words.set(d.tasting_id, [...(words.get(d.tasting_id) ?? []), d.descriptor_id]);
  }
  const notes = page.flatMap((r): FriendNote[] => {
    const vintage = vById.get(r.vintage_id);
    if (!vintage) return [];
    const o = open(r);
    return [
      {
        id: r.id,
        list: { id: r.list_id, title: r.title },
        itemId: r.list_item_id,
        vintage,
        user: { id: r.user_id, name: displayName(r.name, r.email), picture: r.picture },
        at: r.updated_at,
        open: o,
        depth: o ? (toDepth(r.depth) ?? null) : null,
        score: o ? r.score : null,
        buyAgain: o && r.buy_again !== null ? !!r.buy_again : null,
        descriptors: o ? (words.get(r.id) ?? []) : [],
        note: o ? r.note : null,
      },
    ];
  });
  const last = page[page.length - 1]!;
  return { notes, next: more ? `${last.updated_at}|${last.id}` : null };
}

export const friendRoutes = new Hono<{ Bindings: Env }>();

/** ?before= the previous page's `next`; ?vintage= one wine's notes only (the wine page). */
friendRoutes.get("/friends", async (c) => {
  const user = await requireUser(c);
  return c.json(
    await friendFeed(c.env.DB, user.id, {
      before: c.req.query("before") ?? null,
      vintage: c.req.query("vintage") ?? null,
    }),
  );
});
