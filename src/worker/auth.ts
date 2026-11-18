import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { type Depth, type Lang, type Me, isLabelModel, isLang, ulid } from "../shared/model";
import type { Env } from "./env";
import { HttpError, now, randomToken, sha256, timingSafeEqual } from "./http";

/**
 * Google sign-in, the same server-side PKCE flow as the badminton site (googleAuth.ts there), with
 * one account type: a person. Only invited emails get in (docs/design.zh.md §2): OWNER_EMAILS, and
 * whoever an owner added in 我的 → 邀请.
 */

type Ctx<E extends { Bindings: Env } = { Bindings: Env }> = Context<E>;
export const SESSION_COOKIE = "wine_session";
const STATE_COOKIE = "wine_google_state";
const SESSION_DAYS = 30;
const keys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
export const googleEnabled = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const devLoginEnabled = (env: Env) => env.DEV_LOGIN === "1" && env.ENVIRONMENT !== "production";

const cookieOptions = (c: Ctx) => ({
  path: "/",
  httpOnly: true,
  secure: new URL(c.req.url).protocol === "https:",
  sameSite: "Lax" as const,
});

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  locale: string | null;
  depth: string | null;
  label_model: string | null;
  role: string;
  created_at: string;
}

export const ownerEmails = (env: Env) =>
  (env.OWNER_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
export const isOwner = (env: Env, email: string) => ownerEmails(env).includes(email.toLowerCase());

export function meOf(env: Env, u: UserRow): Me {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    locale: isLang(u.locale) ? (u.locale as Lang) : null,
    depth: (u.depth as Depth | null) ?? null,
    labelModel: isLabelModel(u.label_model) ? u.label_model : null,
    owner: isOwner(env, u.email),
  };
}

/** Cookie-authenticated writes must come from this site's own pages. */
export function requireSameOrigin<E extends { Bindings: Env }>(c: Ctx<E>) {
  if (c.req.header("Origin") !== new URL(c.req.url).origin)
    throw new HttpError(403, "csrf", "请求来源无效，请刷新页面重试");
}

export async function currentUser<E extends { Bindings: Env }>(c: Ctx<E>): Promise<UserRow | null> {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  return c.env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ? AND s.expires_at > ?",
  )
    .bind(await sha256(raw), now())
    .first<UserRow>();
}

export async function requireUser<E extends { Bindings: Env }>(c: Ctx<E>): Promise<UserRow> {
  const u = await currentUser(c);
  if (!u) throw new HttpError(401, "login_required", "请先登录");
  return u;
}

/** May this email sign in: an owner, someone invited, or someone who already has an account. */
async function allowed(env: Env, sub: string, email: string): Promise<boolean> {
  if (isOwner(env, email)) return true;
  const row = await env.DB.prepare(
    "SELECT 1 FROM invites WHERE email = ? UNION ALL SELECT 1 FROM users WHERE google_sub = ? LIMIT 1",
  )
    .bind(email.toLowerCase(), sub)
    .first();
  return !!row;
}

/** Accept only HTTPS avatar URLs from Google's image hosts. */
function profilePicture(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com"))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Finds or makes the account and signs this browser in for 30 days. */
async function startSession(
  c: Ctx,
  profile: { sub: string; email: string; name: string | null; picture: string | null },
) {
  const db = c.env.DB;
  const existing = await db
    .prepare("SELECT id FROM users WHERE google_sub = ?")
    .bind(profile.sub)
    .first<{ id: string }>();
  const userId = existing?.id ?? ulid();
  const raw = randomToken(),
    expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const old = getCookie(c, SESSION_COOKIE);
  await db.batch([
    existing
      ? db
          .prepare("UPDATE users SET email = ?, name = COALESCE(?, name), picture = ? WHERE id = ?")
          .bind(profile.email, profile.name, profile.picture, userId)
      : db
          .prepare("INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(userId, profile.sub, profile.email, profile.name, profile.picture, now()),
    db.prepare("DELETE FROM sessions WHERE expires_at < ? OR id_hash = ?").bind(now(), old ? await sha256(old) : ""),
    db
      .prepare("INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .bind(await sha256(raw), userId, expires.toISOString()),
  ]);
  setCookie(c, SESSION_COOKIE, raw, { ...cookieOptions(c), expires });
}

const redirectUri = (env: Env) => `${new URL(env.SITE_ORIGIN).origin}/api/auth/google/callback`;

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get("/session", async (c) => {
  const u = await currentUser(c);
  return c.json({ google: googleEnabled(c.env), dev: devLoginEnabled(c.env), me: u ? meOf(c.env, u) : null });
});

authRoutes.get("/google", async (c) => {
  if (!googleEnabled(c.env)) return c.redirect("/login?error=not_configured");
  const state = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now()),
    c.env.DB.prepare("INSERT INTO oauth_states VALUES (?, ?, ?, ?)").bind(
      await sha256(state),
      nonce,
      verifier,
      new Date(Date.now() + 600_000).toISOString(),
    ),
  ]);
  setCookie(c, STATE_COOKIE, state, { ...cookieOptions(c), maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(c.env),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return c.redirect(url.toString());
});

authRoutes.get("/google/callback", async (c) => {
  const state = c.req.query("state") ?? "",
    cookie = getCookie(c, STATE_COOKIE) ?? "";
  deleteCookie(c, STATE_COOKIE, cookieOptions(c));
  if (!googleEnabled(c.env) || !state || !cookie || !timingSafeEqual(state, cookie))
    return c.redirect("/login?error=invalid_state");
  const saved = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING nonce, verifier",
  )
    .bind(await sha256(state), now())
    .first<{ nonce: string; verifier: string }>();
  if (!saved) return c.redirect("/login?error=invalid_state");
  if (c.req.query("error")) return c.redirect("/login?error=cancelled");
  const code = c.req.query("code");
  if (!code) return c.redirect("/login?error=failed");
  let profile: { sub: string; email: string; name: string | null; picture: string | null };
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(c.env),
        grant_type: "authorization_code",
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("token exchange failed");
    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) throw new Error("missing ID token");
    const { payload } = await jwtVerify(tokens.id_token, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: c.env.GOOGLE_CLIENT_ID!,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat", "nonce", "email"],
    });
    if (
      payload.nonce !== saved.nonce ||
      payload.email_verified !== true ||
      typeof payload.email !== "string" ||
      !payload.sub ||
      (payload.azp !== undefined && payload.azp !== c.env.GOOGLE_CLIENT_ID)
    )
      throw new Error("invalid claims");
    profile = {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name.slice(0, 80) : null,
      picture: profilePicture(payload.picture),
    };
  } catch {
    // Never log codes, tokens or provider responses.
    return c.redirect("/login?error=failed");
  }
  if (!(await allowed(c.env, profile.sub, profile.email))) return c.redirect("/login?error=not_invited");
  await startSession(c, profile);
  return c.redirect("/");
});

/** Local runs and browser tests only: sign in as any email without Google. */
authRoutes.post("/dev", async (c) => {
  if (!devLoginEnabled(c.env)) throw new HttpError(404, "not_found", "Not found");
  requireSameOrigin(c);
  const body = (await c.req.json().catch(() => ({}))) as { email?: unknown; name?: unknown };
  const email = typeof body.email === "string" && /^[^@\s]+@[^@\s]+$/.test(body.email) ? body.email : null;
  if (!email) throw new HttpError(400, "bad_request", "邮箱无效");
  await startSession(c, {
    sub: `dev:${email.toLowerCase()}`,
    email,
    name: typeof body.name === "string" ? body.name : email.split("@")[0]!,
    picture: null,
  });
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  requireSameOrigin(c);
  const raw = getCookie(c, SESSION_COOKIE);
  if (raw)
    await c.env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?")
      .bind(await sha256(raw))
      .run();
  deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
  return c.json({ ok: true });
});
