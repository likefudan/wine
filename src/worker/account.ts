import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { SESSION_COOKIE, requireSameOrigin, requireUser } from "./auth";
import type { Env } from "./env";
import { badRequest, readJson } from "./http";

/**
 * 删除账号: everything of mine goes, at once and for good. Notes, cellar, label photos, my own 品鉴
 * (the others' notes in them stay in their own 酒库, as when I delete one), my place in other people's
 * 品鉴, my photo and my sessions. What others rely on stays without my name: a wine I added to the
 * shared catalogue, a 专业评价 lookup I started, a glass I added to someone else's 品鉴 (now the
 * host's), and the cost lines of what I used.
 */
export const accountRoutes = new Hono<{ Bindings: Env }>();

accountRoutes.post("/me/delete", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  if ((await readJson(c.req.raw)).confirm !== true) throw badRequest("请确认删除");
  const db = c.env.DB;
  const uid = user.id;
  const photos = await db.prepare("SELECT r2_key FROM photos WHERE user_id = ?").bind(uid).all<{ r2_key: string }>();
  const mineLists = "SELECT id FROM lists WHERE owner_id = ?1";
  await db.batch([
    // My own 品鉴: everyone's notes leave them first, then the lists go.
    db
      .prepare(
        `UPDATE tastings SET list_item_id = NULL WHERE list_item_id IN (SELECT id FROM list_items WHERE list_id IN (${mineLists}))`,
      )
      .bind(uid),
    db.prepare(`DELETE FROM list_items WHERE list_id IN (${mineLists})`).bind(uid),
    db.prepare(`DELETE FROM list_members WHERE list_id IN (${mineLists})`).bind(uid),
    db.prepare("DELETE FROM lists WHERE owner_id = ?").bind(uid),
    // Glasses I added to other people's 品鉴 stay, as the host's.
    db
      .prepare(
        "UPDATE list_items SET added_by = (SELECT owner_id FROM lists l WHERE l.id = list_items.list_id) WHERE added_by = ?",
      )
      .bind(uid),
    db.prepare("DELETE FROM list_members WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM tastings WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM cellar WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM photos WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM user_avatars WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM pro_review_imports WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM pro_review_reports WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM ai_jobs WHERE user_id = ?").bind(uid),
    db.prepare("UPDATE ai_calls SET user_id = NULL WHERE user_id = ?").bind(uid),
    db.prepare("UPDATE pro_reviews SET requested_by = NULL WHERE requested_by = ?").bind(uid),
    db.prepare("UPDATE wines SET created_by = NULL WHERE created_by = ?").bind(uid),
    db.prepare("UPDATE invites SET invited_by = NULL WHERE invited_by = ?").bind(uid),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(uid),
    db.prepare("DELETE FROM users WHERE id = ?").bind(uid),
  ]);
  if (c.env.PHOTOS) {
    const keys = photos.results.map((p) => p.r2_key);
    for (let i = 0; i < keys.length; i += 1000) await c.env.PHOTOS.delete(keys.slice(i, i + 1000));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
