import { Hono } from "hono";
import { isDescriptorId } from "../shared/descriptors";
import {
  COLORS,
  DEPTHS,
  ID_RE,
  LIST_KINDS,
  type ListItem,
  MAX_SCORE,
  MIN_SCORE,
  type Op,
  type OpResult,
  type SyncData,
  type Tasting,
  type VintageInfo,
  type WineList,
  clampText,
  isLabelModel,
  isLang,
  nameKey,
  ulid,
  type LwinWine,
  searchWords,
} from "../shared/model";
import { type UserRow, isOwner, meOf, requireSameOrigin, requireUser } from "./auth";
import type { Env } from "./env";
import { HttpError, now, readJson } from "./http";

/**
 * The phone keeps its own copy of everything of one person's and works offline (docs/design.zh.md
 * §2): GET /api/sync hands over that copy, POST /api/ops takes the changes made since, in order.
 * Every change carries the phone's own id, so sending it twice does no harm.
 */

type DB = D1Database;
const MAX_OPS = 100;

class OpError extends Error {}
const fail = (msg: string): never => {
  throw new OpError(msg);
};

const json = (v: unknown, max: number): string => {
  const s = JSON.stringify(v && typeof v === "object" && !Array.isArray(v) ? v : {});
  if (s.length > max) fail("内容太长");
  return s;
};
const parse = <T>(s: string | null): T => {
  try {
    return (s ? JSON.parse(s) : {}) as T;
  } catch {
    return {} as T;
  }
};
const id = (v: unknown): string => (typeof v === "string" && ID_RE.test(v) ? v : fail("编号无效"));
const optNum = (v: unknown, min: number, max: number): number | null =>
  v === null || v === undefined || v === ""
    ? null
    : typeof v === "number" && v >= min && v <= max
      ? v
      : fail("数字无效");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown): string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : now();

// ── Reading ──────────────────────────────────────────────────────────────────────────────────

interface VintageRow {
  id: string;
  wine_id: string;
  year: number;
  abv: number | null;
  wine: string;
  color: string;
  appellation: string | null;
  grapes: string;
  producer: string;
  country: string | null;
  region: string | null;
  place_id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}
export const VINTAGE_SELECT = `SELECT v.id, v.wine_id, v.year, v.abv, w.name AS wine, w.color, w.appellation, w.grapes,
  p.name AS producer, p.country, p.region, p.place_id, p.address, p.lat, p.lng
  FROM vintages v JOIN wines w ON w.id = v.wine_id JOIN producers p ON p.id = w.producer_id`;

export const vintageInfo = (r: VintageRow): VintageInfo => ({
  id: r.id,
  wineId: r.wine_id,
  producer: r.producer,
  wine: r.wine,
  year: r.year,
  color: r.color as VintageInfo["color"],
  country: r.country,
  region: r.region,
  appellation: r.appellation,
  grapes: parse<string[]>(r.grapes),
  abv: r.abv,
  place: r.place_id ? { id: r.place_id, address: r.address ?? "", lat: r.lat, lng: r.lng } : null,
});

interface TastingRow {
  id: string;
  vintage_id: string;
  list_item_id: string | null;
  tasted_at: string;
  depth: string;
  appearance: string;
  nose: string;
  palate: string;
  extra: string;
  guesses: string;
  quality: string | null;
  score: number | null;
  buy_again: number | null;
  bought_qty: number | null;
  price_usd: number | null;
  note: string | null;
  photo_id: string | null;
  updated_at: string;
}

export async function syncData(env: Env, user: UserRow): Promise<SyncData> {
  const db = env.DB;
  const [lists, items, tastings, descriptors] = await db.batch([
    db
      .prepare(
        `SELECT l.* FROM lists l JOIN list_members m ON m.list_id = l.id AND m.user_id = ? ORDER BY l.created_at DESC`,
      )
      .bind(user.id),
    db
      .prepare(
        `SELECT i.* FROM list_items i JOIN list_members m ON m.list_id = i.list_id AND m.user_id = ? ORDER BY i.position`,
      )
      .bind(user.id),
    db.prepare("SELECT * FROM tastings WHERE user_id = ? ORDER BY tasted_at DESC").bind(user.id),
    db
      .prepare(
        "SELECT d.tasting_id, d.descriptor_id, d.intensity FROM tasting_descriptors d JOIN tastings t ON t.id = d.tasting_id WHERE t.user_id = ?",
      )
      .bind(user.id),
  ]);
  const vintages = await db
    .prepare(
      `${VINTAGE_SELECT} WHERE v.id IN (
        SELECT vintage_id FROM tastings WHERE user_id = ?1
        UNION SELECT i.vintage_id FROM list_items i JOIN list_members m ON m.list_id = i.list_id AND m.user_id = ?1)`,
    )
    .bind(user.id)
    .all<VintageRow>();
  const byTasting = new Map<string, { id: string; intensity: number }[]>();
  for (const d of descriptors!.results as { tasting_id: string; descriptor_id: string; intensity: number }[]) {
    const list = byTasting.get(d.tasting_id) ?? [];
    list.push({ id: d.descriptor_id, intensity: d.intensity });
    byTasting.set(d.tasting_id, list);
  }
  return {
    me: meOf(env, user),
    lists: (lists!.results as Record<string, string | null>[]).map(
      (l): WineList => ({
        id: l.id!,
        title: l.title!,
        kind: l.kind as WineList["kind"],
        startsOn: l.starts_on ?? null,
        note: l.note ?? null,
        createdAt: l.created_at!,
        updatedAt: l.updated_at!,
      }),
    ),
    items: (items!.results as Record<string, string | number | null>[]).map(
      (i): ListItem => ({
        id: i.id as string,
        listId: i.list_id as string,
        vintageId: i.vintage_id as string,
        position: i.position as number,
        priceUsd: (i.price_usd as number | null) ?? null,
        createdAt: i.created_at as string,
      }),
    ),
    vintages: vintages.results.map(vintageInfo),
    tastings: (tastings!.results as unknown as TastingRow[]).map(
      (t): Tasting => ({
        id: t.id,
        vintageId: t.vintage_id,
        listItemId: t.list_item_id,
        tastedAt: t.tasted_at,
        depth: t.depth as Tasting["depth"],
        appearance: parse(t.appearance),
        nose: parse(t.nose),
        palate: parse(t.palate),
        extra: parse(t.extra),
        guesses: parse(t.guesses),
        descriptors: byTasting.get(t.id) ?? [],
        quality: t.quality,
        score: t.score,
        buyAgain: t.buy_again === null ? null : !!t.buy_again,
        boughtQty: t.bought_qty,
        priceUsd: t.price_usd,
        note: t.note,
        photoId: t.photo_id,
        updatedAt: t.updated_at,
      }),
    ),
  };
}

// ── Changes ──────────────────────────────────────────────────────────────────────────────────

/** The vintage an id stands for, following an alias; fails when there is none. */
async function resolveVintage(db: DB, vintageId: string): Promise<string> {
  const row = await db
    .prepare(
      "SELECT id FROM vintages WHERE id = COALESCE((SELECT vintage_id FROM vintage_aliases WHERE alias_id = ?1), ?1)",
    )
    .bind(vintageId)
    .first<{ id: string }>();
  return row?.id ?? fail("找不到这款酒");
}

async function isMember(db: DB, listId: string, userId: string) {
  return !!(await db
    .prepare("SELECT 1 FROM list_members WHERE list_id = ? AND user_id = ?")
    .bind(listId, userId)
    .first());
}

/** Finds the wine by its producer and name, or adds it to the shared catalogue. */
export async function putVintage(db: DB, user: UserRow, o: Extract<Op, { op: "putVintage" }>): Promise<string> {
  const vid = id(o.id);
  const known = await db
    .prepare(
      "SELECT id FROM vintages WHERE id = ?1 UNION ALL SELECT vintage_id FROM vintage_aliases WHERE alias_id = ?1",
    )
    .bind(vid)
    .first<{ id: string }>();
  if (known) return known.id;
  const producer = clampText(o.producer, 120) ?? fail("请填写酒庄");
  const wine = clampText(o.wine, 160) ?? producer;
  const year =
    o.year === 0 || (Number.isInteger(o.year) && o.year >= 1900 && o.year <= 2100) ? o.year : fail("年份无效");
  if (!(COLORS as readonly string[]).includes(o.color)) fail("颜色无效");
  const grapes = Array.isArray(o.grapes)
    ? o.grapes.flatMap((g) => (typeof g === "string" && g.trim() ? [g.trim().slice(0, 60)] : [])).slice(0, 8)
    : [];
  const lwin = Number.isInteger(o.lwin) && o.lwin! > 0 ? o.lwin! : null;
  const pKey = nameKey(producer, true) || nameKey(producer);
  const wKey = nameKey(wine);
  if (!pKey || !wKey) fail("请填写酒庄和酒名");
  const at = now();
  await db
    .prepare(
      "INSERT INTO producers (id, name, name_key, country, region, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (name_key) DO NOTHING",
    )
    .bind(ulid(), producer, pKey, clampText(o.country, 60), clampText(o.region, 80), at)
    .run();
  const p = (await db.prepare("SELECT id FROM producers WHERE name_key = ?").bind(pKey).first<{ id: string }>())!;
  const place = o.place;
  if (place && typeof place.id === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(place.id)) {
    // The first person to pin a producer on the map decides where it is.
    await db
      .prepare("UPDATE producers SET place_id = ?, address = ?, lat = ?, lng = ? WHERE id = ? AND place_id IS NULL")
      .bind(place.id, clampText(place.address, 200), optNum(place.lat, -90, 90), optNum(place.lng, -180, 180), p.id)
      .run();
  }
  await db
    .prepare(
      `INSERT INTO wines (id, producer_id, name, name_key, color, appellation, grapes, created_by, created_at, lwin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (producer_id, name_key) DO UPDATE SET lwin = coalesce(wines.lwin, excluded.lwin)`,
    )
    .bind(ulid(), p.id, wine, wKey, o.color, clampText(o.appellation, 80), JSON.stringify(grapes), user.id, at, lwin)
    .run();
  const w = (await db
    .prepare("SELECT id FROM wines WHERE producer_id = ? AND name_key = ?")
    .bind(p.id, wKey)
    .first<{ id: string }>())!;
  const abv = optNum(o.abv, 0, 30);
  const existing = await db
    .prepare("SELECT id FROM vintages WHERE wine_id = ? AND year = ?")
    .bind(w.id, year)
    .first<{ id: string }>();
  if (existing) {
    await db.prepare("INSERT OR IGNORE INTO vintage_aliases VALUES (?, ?)").bind(vid, existing.id).run();
    return existing.id;
  }
  await db
    .prepare("INSERT INTO vintages (id, wine_id, year, abv, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(vid, w.id, year, abv, at)
    .run();
  return vid;
}

async function putList(db: DB, user: UserRow, l: WineList) {
  const lid = id(l?.id);
  const title = clampText(l.title, 80) ?? fail("请填写酒单名称");
  const kind = (LIST_KINDS as readonly string[]).includes(l.kind) ? l.kind : "winery";
  const startsOn = typeof l.startsOn === "string" && DATE_RE.test(l.startsOn) ? l.startsOn : null;
  const note = clampText(l.note, 500);
  const existing = await db.prepare("SELECT owner_id FROM lists WHERE id = ?").bind(lid).first<{ owner_id: string }>();
  const at = now();
  if (existing) {
    if (existing.owner_id !== user.id) fail("只有酒单的创建者能修改");
    await db
      .prepare("UPDATE lists SET title = ?, kind = ?, starts_on = ?, note = ?, updated_at = ? WHERE id = ?")
      .bind(title, kind, startsOn, note, at, lid)
      .run();
    return;
  }
  await db.batch([
    db
      .prepare(
        "INSERT INTO lists (id, owner_id, title, kind, starts_on, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(lid, user.id, title, kind, startsOn, note, iso(l.createdAt), at),
    db
      .prepare("INSERT INTO list_members (list_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
      .bind(lid, user.id, at),
  ]);
}

async function deleteList(db: DB, user: UserRow, listId: string) {
  const l = await db.prepare("SELECT owner_id FROM lists WHERE id = ?").bind(id(listId)).first<{ owner_id: string }>();
  if (!l) return;
  if (l.owner_id !== user.id) fail("只有酒单的创建者能删除");
  // The notes stay in each person's 酒库 (docs/design.zh.md §3.6): they lose only their place in the list.
  await db.batch([
    db
      .prepare(
        "UPDATE tastings SET list_item_id = NULL WHERE list_item_id IN (SELECT id FROM list_items WHERE list_id = ?)",
      )
      .bind(listId),
    db.prepare("DELETE FROM list_items WHERE list_id = ?").bind(listId),
    db.prepare("DELETE FROM list_members WHERE list_id = ?").bind(listId),
    db.prepare("DELETE FROM lists WHERE id = ?").bind(listId),
  ]);
}

async function putItem(db: DB, user: UserRow, i: ListItem) {
  const iid = id(i?.id);
  const listId = id(i.listId);
  if (!(await isMember(db, listId, user.id))) fail("你不是这份酒单的成员");
  const vintageId = await resolveVintage(db, id(i.vintageId));
  const position = Number.isInteger(i.position) ? i.position : 0;
  const price = optNum(i.priceUsd, 0, 100_000);
  const existing = await db
    .prepare("SELECT list_id FROM list_items WHERE id = ?")
    .bind(iid)
    .first<{ list_id: string }>();
  if (existing) {
    if (existing.list_id !== listId) fail("编号无效");
    await db
      .prepare("UPDATE list_items SET vintage_id = ?, position = ?, price_usd = ? WHERE id = ?")
      .bind(vintageId, position, price, iid)
      .run();
  } else {
    await db
      .prepare(
        "INSERT INTO list_items (id, list_id, vintage_id, position, price_usd, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(iid, listId, vintageId, position, price, user.id, iso(i.createdAt))
      .run();
  }
  await db.prepare("UPDATE lists SET updated_at = ? WHERE id = ?").bind(now(), listId).run();
}

async function deleteItem(db: DB, user: UserRow, itemId: string) {
  const row = await db
    .prepare(
      "SELECT i.list_id, i.added_by, l.owner_id FROM list_items i JOIN lists l ON l.id = i.list_id WHERE i.id = ?",
    )
    .bind(id(itemId))
    .first<{ list_id: string; added_by: string; owner_id: string }>();
  if (!row) return;
  if (row.added_by !== user.id && row.owner_id !== user.id) fail("只有添加的人或酒单创建者能移除");
  await db.batch([
    db.prepare("UPDATE tastings SET list_item_id = NULL WHERE list_item_id = ?").bind(itemId),
    db.prepare("DELETE FROM list_items WHERE id = ?").bind(itemId),
  ]);
}

async function reorder(db: DB, user: UserRow, listId: string, ids: unknown) {
  if (!(await isMember(db, id(listId), user.id))) fail("你不是这份酒单的成员");
  if (!Array.isArray(ids) || ids.length > 500) fail("顺序无效");
  const list = ids as unknown[];
  if (!list.length) return;
  await db.batch(
    list.map((itemId, n) =>
      db.prepare("UPDATE list_items SET position = ? WHERE id = ? AND list_id = ?").bind(n, id(itemId), listId),
    ),
  );
}

async function putTasting(db: DB, user: UserRow, t: Tasting) {
  const tid = id(t?.id);
  const existing = await db
    .prepare("SELECT user_id, updated_at FROM tastings WHERE id = ?")
    .bind(tid)
    .first<{ user_id: string; updated_at: string }>();
  if (existing && existing.user_id !== user.id) fail("只能修改自己的品鉴");
  const updatedAt = iso(t.updatedAt);
  // A later edit from another phone already arrived: keep it.
  if (existing && existing.updated_at > updatedAt) return;
  const vintageId = await resolveVintage(db, id(t.vintageId));
  let itemId: string | null = null;
  if (t.listItemId) {
    const item = await db
      .prepare(
        "SELECT i.id FROM list_items i JOIN list_members m ON m.list_id = i.list_id AND m.user_id = ? WHERE i.id = ?",
      )
      .bind(user.id, id(t.listItemId))
      .first<{ id: string }>();
    itemId = item?.id ?? null;
    // Two phones each started a note for the same wine in a list: keep both, the second outside the list.
    if (itemId) {
      const other = await db
        .prepare("SELECT id FROM tastings WHERE list_item_id = ? AND user_id = ? AND id <> ?")
        .bind(itemId, user.id, tid)
        .first();
      if (other) itemId = null;
    }
  }
  const depth = (DEPTHS as readonly string[]).includes(t.depth) ? t.depth : "quick";
  const score = t.score === null || t.score === undefined ? null : Math.round(optNum(t.score, MIN_SCORE, MAX_SCORE)!);
  const descriptors = Array.isArray(t.descriptors)
    ? [...new Map(t.descriptors.filter((d) => isDescriptorId(d?.id)).map((d) => [d.id, d])).values()].slice(0, 40)
    : [];
  const values = [
    vintageId,
    itemId,
    iso(t.tastedAt),
    depth,
    json(t.appearance, 2000),
    json(t.nose, 4000),
    json(t.palate, 2000),
    json(t.extra, 2000),
    json(t.guesses, 1000),
    clampText(t.quality, 20),
    score,
    t.buyAgain === null || t.buyAgain === undefined ? null : t.buyAgain ? 1 : 0,
    optNum(t.boughtQty, 0, 1000),
    optNum(t.priceUsd, 0, 100_000),
    clampText(t.note, 4000),
    typeof t.photoId === "string" && ID_RE.test(t.photoId) ? t.photoId : null,
    updatedAt,
  ];
  await db.batch([
    existing
      ? db
          .prepare(
            `UPDATE tastings SET vintage_id = ?, list_item_id = ?, tasted_at = ?, depth = ?, appearance = ?, nose = ?,
             palate = ?, extra = ?, guesses = ?, quality = ?, score = ?, buy_again = ?, bought_qty = ?, price_usd = ?,
             note = ?, photo_id = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(...values, tid)
      : db
          .prepare(
            `INSERT INTO tastings (vintage_id, list_item_id, tasted_at, depth, appearance, nose, palate, extra, guesses,
             quality, score, buy_again, bought_qty, price_usd, note, photo_id, updated_at, id, user_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(...values, tid, user.id, now()),
    db.prepare("DELETE FROM tasting_descriptors WHERE tasting_id = ?").bind(tid),
    ...descriptors.map((d) =>
      db
        .prepare("INSERT INTO tasting_descriptors (tasting_id, descriptor_id, intensity) VALUES (?, ?, ?)")
        .bind(tid, d.id, Number.isInteger(d.intensity) && d.intensity >= 1 && d.intensity <= 3 ? d.intensity : 2),
    ),
  ]);
}

async function deleteTasting(db: DB, user: UserRow, tastingId: string) {
  await db.prepare("DELETE FROM tastings WHERE id = ? AND user_id = ?").bind(id(tastingId), user.id).run();
}

async function putMe(db: DB, user: UserRow, o: Extract<Op, { op: "putMe" }>) {
  if (o.locale !== undefined && isLang(o.locale))
    await db.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(o.locale, user.id).run();
  if (o.depth !== undefined && (DEPTHS as readonly string[]).includes(o.depth))
    await db.prepare("UPDATE users SET depth = ? WHERE id = ?").bind(o.depth, user.id).run();
  if (o.labelModel !== undefined && isLabelModel(o.labelModel))
    await db.prepare("UPDATE users SET label_model = ? WHERE id = ?").bind(o.labelModel, user.id).run();
}

export async function applyOp(db: DB, user: UserRow, o: Op): Promise<OpResult> {
  try {
    switch (o?.op) {
      case "putVintage":
        return { ok: true, vintageId: await putVintage(db, user, o) };
      case "putList":
        await putList(db, user, o.list);
        break;
      case "deleteList":
        await deleteList(db, user, o.id);
        break;
      case "putItem":
        await putItem(db, user, o.item);
        break;
      case "deleteItem":
        await deleteItem(db, user, o.id);
        break;
      case "reorder":
        await reorder(db, user, o.listId, o.ids);
        break;
      case "putTasting":
        await putTasting(db, user, o.tasting);
        break;
      case "deleteTasting":
        await deleteTasting(db, user, o.id);
        break;
      case "putMe":
        await putMe(db, user, o);
        break;
      default:
        return { ok: false, error: "未知操作" };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof OpError) return { ok: false, error: e.message };
    if (e instanceof TypeError) return { ok: false, error: "内容无效" };
    throw e;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────────────────────

export const dataRoutes = new Hono<{ Bindings: Env }>();

dataRoutes.get("/sync", async (c) => c.json(await syncData(c.env, await requireUser(c))));

dataRoutes.post("/ops", async (c) => {
  requireSameOrigin(c);
  const user = await requireUser(c);
  const body = await readJson(c.req.raw);
  const ops = Array.isArray(body.ops) ? (body.ops as Op[]) : [];
  if (ops.length > MAX_OPS) throw new HttpError(400, "too_many", "一次最多上传 100 条");
  const results: OpResult[] = [];
  // In order: a note may name the wine added just before it.
  for (const o of ops) results.push(await applyOp(c.env.DB, user, o));
  return c.json({ results });
});

/** The shared catalogue, for 输入联想: wines whose producer or name contains what was typed. */
dataRoutes.get("/catalog", async (c) => {
  await requireUser(c);
  const q = nameKey(c.req.query("q") ?? "");
  if (q.length < 2) return c.json({ wines: [], lwin: [] });
  const words = q.split(" ").slice(0, 4);
  const where = words.map(() => "instr(p.name_key || ' ' || w.name_key, ?) > 0").join(" AND ");
  const wines = await c.env.DB.prepare(
    `SELECT w.id, w.name, w.color, w.appellation, w.grapes, p.name AS producer, p.country, p.region,
       (SELECT json_group_array(json_object('id', v.id, 'year', v.year, 'abv', v.abv)) FROM vintages v WHERE v.wine_id = w.id) AS vintages
     FROM wines w JOIN producers p ON p.id = w.producer_id WHERE ${where}
     ORDER BY CASE WHEN p.name_key LIKE ? OR w.name_key LIKE ? THEN 0 ELSE 1 END, p.name, w.name LIMIT 20`,
  )
    .bind(...words, `${q}%`, `${q}%`)
    .all<Record<string, string | null>>();
  return c.json({
    lwin: await searchLwin(c.env.DB, c.req.query("q") ?? ""),
    wines: wines.results.map((w) => ({
      wineId: w.id,
      producer: w.producer,
      wine: w.name,
      color: w.color,
      country: w.country,
      region: w.region,
      appellation: w.appellation,
      grapes: parse<string[]>(w.grapes ?? null),
      vintages: (parse<{ id: string; year: number; abv: number | null }[]>(w.vintages ?? null) || []).sort(
        (a, b) => b.year - a.year,
      ),
    })),
  });
});

/**
 * 公共酒款库 (LWIN): wines with every typed word as the start of one of their words. The longest word
 * reads its index range first; grand vins and short names come first.
 */
export async function searchLwin(db: DB, q: string): Promise<LwinWine[]> {
  const words = searchWords(q).sort((a, b) => b.length - a.length);
  if (!words.length || words[0]!.length < 2) return [];
  const match = words.map(() => "lwin IN (SELECT lwin FROM lwin_words WHERE word >= ? AND word < ?)").join(" AND ");
  const rows = await db
    .prepare(
      `SELECT lwin, producer, wine, color, country, region, appellation, classification FROM lwin
       WHERE ${match} ORDER BY wine = producer DESC, length(producer) + length(wine), lwin LIMIT 12`,
    )
    .bind(...words.flatMap((w) => [w, `${w}\uffff`]))
    .all<LwinWine>();
  return rows.results;
}

// ── Invites ──────────────────────────────────────────────────────────────────────────────────

const requireOwner = async (c: Parameters<typeof requireUser>[0]) => {
  const u = await requireUser(c);
  if (!isOwner(c.env, u.email)) throw new HttpError(403, "forbidden", "只有站长能管理邀请");
  return u;
};

dataRoutes.get("/invites", async (c) => {
  await requireOwner(c);
  const rows = await c.env.DB.prepare(
    `SELECT i.email, i.created_at, (SELECT 1 FROM users u WHERE lower(u.email) = i.email) AS joined
     FROM invites i ORDER BY i.created_at DESC`,
  ).all<{ email: string; created_at: string; joined: number | null }>();
  return c.json({ invites: rows.results.map((r) => ({ email: r.email, joined: !!r.joined })) });
});

dataRoutes.post("/invites", async (c) => {
  requireSameOrigin(c);
  const u = await requireOwner(c);
  const email = String((await readJson(c.req.raw)).email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200)
    throw new HttpError(400, "bad_email", "请填写正确的邮箱");
  await c.env.DB.prepare("INSERT OR IGNORE INTO invites (email, invited_by, created_at) VALUES (?, ?, ?)")
    .bind(email, u.id, now())
    .run();
  return c.json({ ok: true });
});

dataRoutes.delete("/invites/:email", async (c) => {
  requireSameOrigin(c);
  await requireOwner(c);
  await c.env.DB.prepare("DELETE FROM invites WHERE email = ?").bind(c.req.param("email").toLowerCase()).run();
  return c.json({ ok: true });
});
