import { Hono } from "hono";
import { type AvatarMode, checkNickname } from "../shared/model";
import { type UserRow, meOf, requireSameOrigin, requireUser } from "./auth";
import type { Env } from "./env";
import { HttpError, badRequest, now, randomToken, readJson } from "./http";

/**
 * 昵称和头像 (Ke Li 2026-11-18), as on the badminton site (avatars.ts there): the name Google gives
 * is not always the one a person wants others to see, so they may pick their own, and a photo of
 * their own instead of their Google picture (or none). Everyone else sees these: a shared 品鉴's
 * members and notes, 朋友动态, the owner's 成员 list, and the 分享图 signature.
 *
 * The phone crops the photo square and shrinks it to 256 px before sending (src/web/Profile.tsx),
 * so one is about 10-20 KB; it lives in D1 under a random id that changes on every upload, so its
 * URL is cached for good.
 */
export const AVATAR_MAX_BYTES = 150_000;
const AVATAR_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

type ProfileFields = Pick<UserRow, "name" | "picture" | "nickname" | "avatar">;

/** Their own name, else Google's (sharing.ts displayName() falls back to the email's front). */
export const nameOf = (u: Pick<ProfileFields, "name" | "nickname">) => u.nickname?.trim() || u.name;

/** Where pages load a person's picture from, or null for their initial. */
export function avatarUrl(u: Pick<ProfileFields, "picture" | "avatar">): string | null {
  if (u.avatar === "none") return null;
  if (u.avatar) return `/api/avatars/${u.avatar}`;
  return u.picture;
}

export const avatarMode = (u: Pick<ProfileFields, "avatar">): AvatarMode =>
  u.avatar === "none" ? "none" : u.avatar ? "own" : "google";

/**
 * The same two, for SQL that lists other people (`u` = the users row's alias), so each query can
 * keep reading `name` and `picture` as before.
 */
export const NAME_SQL = (u = "u") => `COALESCE(NULLIF(TRIM(${u}.nickname), ''), ${u}.name)`;
export const PICTURE_SQL = (u = "u") =>
  `CASE WHEN ${u}.avatar = 'none' THEN NULL WHEN ${u}.avatar IS NOT NULL THEN '/api/avatars/' || ${u}.avatar ELSE ${u}.picture END`;

function jpeg(v: unknown): Uint8Array {
  if (typeof v !== "string" || !v) throw badRequest("请选择一张照片");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
  } catch {
    throw badRequest("照片格式不对，请换一张");
  }
  if (bytes.length > AVATAR_MAX_BYTES) throw badRequest("照片太大了，请换一张");
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw badRequest("照片格式不对，请换一张");
  return bytes;
}

const reload = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>() as Promise<UserRow>;

export const profileRoutes = new Hono<{ Bindings: Env }>();

/** 昵称: empty goes back to the Google name. */
profileRoutes.post("/me/name", async (c) => {
  requireSameOrigin(c);
  const u = await requireUser(c);
  const body = await readJson(c.req.raw);
  if (typeof body.name !== "string") throw badRequest("请填写昵称");
  const name = body.name.trim();
  const err = name ? checkNickname(name) : null;
  if (err) throw badRequest(err);
  await c.env.DB.prepare("UPDATE users SET nickname = ? WHERE id = ?")
    .bind(name || null, u.id)
    .run();
  return c.json({ me: meOf(c.env, await reload(c.env, u.id)) });
});

/** A new photo replaces the old one (whose URL stops working). */
profileRoutes.post("/me/avatar", async (c) => {
  requireSameOrigin(c);
  const u = await requireUser(c);
  const bytes = jpeg((await readJson(c.req.raw)).image);
  const id = randomToken();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_avatars WHERE user_id = ?").bind(u.id),
    c.env.DB.prepare("INSERT INTO user_avatars (id, user_id, image, created_at) VALUES (?, ?, ?, ?)").bind(
      id,
      u.id,
      bytes,
      now(),
    ),
    c.env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(id, u.id),
  ]);
  return c.json({ me: meOf(c.env, await reload(c.env, u.id)) });
});

/** 用 Google 头像 or 不用头像: their own photo, if any, is deleted. */
profileRoutes.post("/me/avatar/mode", async (c) => {
  requireSameOrigin(c);
  const u = await requireUser(c);
  const mode = (await readJson(c.req.raw)).mode;
  if (mode !== "google" && mode !== "none") throw badRequest("请选择头像");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_avatars WHERE user_id = ?").bind(u.id),
    c.env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(mode === "none" ? "none" : null, u.id),
  ]);
  return c.json({ me: meOf(c.env, await reload(c.env, u.id)) });
});

/** The photo itself; anyone with its (random) id may load it, like an image link. */
profileRoutes.get("/avatars/:id", async (c) => {
  const id = c.req.param("id");
  if (!AVATAR_ID_RE.test(id)) throw new HttpError(404, "not_found", "找不到这张照片");
  const row = await c.env.DB.prepare("SELECT image FROM user_avatars WHERE id = ?")
    .bind(id)
    .first<{ image: ArrayBuffer | number[] }>();
  if (!row) throw new HttpError(404, "not_found", "找不到这张照片");
  return c.body(new Uint8Array(row.image), 200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
});
