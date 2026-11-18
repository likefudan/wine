import { useEffect, useState } from "preact/hooks";
import { BLIND, type BlindInfo, nextLabel } from "../shared/blind";
import { type CellarLot, DEFAULT_SIZE, type ProWindow } from "../shared/cellar";
import type { ProScore } from "../shared/taste";
import { tidyPlace } from "../shared/place";
import {
  type Board,
  type Depth,
  type LabelModel,
  type Lang,
  type ListItem,
  type Me,
  type NearbyPlaces,
  type Op,
  type OpResult,
  type SyncData,
  type Tasting,
  type TastingLocation,
  type VintageInfo,
  type Visibility,
  type WineList,
  ulid,
} from "../shared/model";

/**
 * The phone's own copy of everything of mine (docs/design.zh.md §2 离线). Every change is made here
 * first and queued; the queue goes up in order whenever there is a network, and the server's copy
 * comes back down once the queue is empty. Tasting rooms often have no signal, so nothing on the
 * page ever waits for the server.
 *
 * Kept in IndexedDB as one record: one person's notes are hundreds to a few thousand rows.
 */

export interface State {
  me: Me | null;
  lists: WineList[];
  items: ListItem[];
  vintages: VintageInfo[];
  tastings: Tasting[];
  /** 酒窖: my bottles, drunk ones (qty 0) included. */
  cellar: CellarLot[];
  /** The critics' drinking windows for wines in the cellar (from the server, read-only). */
  proWindows: ProWindow[];
  /** The critics' scores on my wines (from the server, read-only): 推荐's 我与评论家. */
  proScores: ProScore[];
  queue: Op[];
  syncedAt: string | null;
  /** The last change the server refused, to show once. */
  rejected: string | null;
  /** Wine ids the server replaced with the one it already had (remapVintage). */
  aliases: Record<string, string>;
  /** Uploading failed while online (server down, not just no signal); cleared by the next success. */
  stuck: boolean;
  /**
   * Changes the server refused (an op answered ok:false). They stay on the phone, and their records
   * stay in the page over the server's copy, until I retry them or let them go (我的 → 通用).
   */
  failed: FailedOp[];
  /** Whose notes these are: kept when the session ends, so unsent ones wait for the same person. */
  ownerId: string | null;
}

export interface FailedOp {
  op: Op;
  error: string;
  at: string;
}

const EMPTY: State = {
  me: null,
  lists: [],
  items: [],
  vintages: [],
  tastings: [],
  cellar: [],
  proWindows: [],
  proScores: [],
  queue: [],
  syncedAt: null,
  rejected: null,
  aliases: {},
  stuck: false,
  failed: [],
  ownerId: null,
};
let state: State = EMPTY;
const listeners = new Set<() => void>();

export const getState = () => state;

function set(next: Partial<State>, persist = true) {
  state = { ...state, ...next };
  for (const f of listeners) f();
  if (persist) save();
}

export function useStore<T>(pick: (s: State) => T): T {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return pick(state);
}

// ── IndexedDB ────────────────────────────────────────────────────────────────────────────────

const DB_NAME = "wine";
let dbPromise: Promise<IDBDatabase | null> | null = null;
function idb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    const db = await idb();
    if (!db) return;
    try {
      const { rejected: _, stuck: __, ...keep } = state;
      db.transaction("kv", "readwrite").objectStore("kv").put(keep, "state");
    } catch {
      // storage full or gone: the server still has everything already sent
    }
  }, 150);
}

export async function loadLocal(): Promise<State> {
  const db = await idb();
  if (!db) return state;
  const saved = await new Promise<State | undefined>((resolve) => {
    try {
      const req = db.transaction("kv").objectStore("kv").get("state");
      req.onsuccess = () => resolve(req.result as State | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  if (saved) set({ ...EMPTY, ...saved }, false);
  return state;
}

/** Signing out (or someone else signing in): the next person must not see the last one's notes. */
export function clearLocal() {
  set({ ...EMPTY });
}

/** Changes made on this phone that the server does not have yet (waiting, or refused). */
export const unsentCount = (s: State = state) => s.queue.length + s.failed.length;

/**
 * The session ended (it expired, or the server said 401). Unsent notes are never thrown away for
 * that: only who is signed in is forgotten, and the notes wait for the same person to sign in again.
 */
export function sessionEnded() {
  if (unsentCount()) set({ me: null, ownerId: state.ownerId ?? state.me?.id ?? null });
  else clearLocal();
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction("kv").objectStore("kv").get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
async function kvPut(key: string, value: unknown): Promise<void> {
  const db = await idb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction("kv", "readwrite");
      if (value === undefined) tx.objectStore("kv").delete(key);
      else tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

type Stash = { queue: Op[]; failed: FailedOp[] };

/**
 * Someone signs in on this phone. If the notes here are another person's, their unsent changes are
 * put aside for them (never uploaded as mine) and the phone starts empty; if I had changes put aside
 * earlier, they come back to be sent.
 */
export async function signedInAs(me: Me) {
  const owner = state.ownerId ?? state.me?.id ?? null;
  if (owner && owner !== me.id) {
    if (unsentCount()) {
      const old = (await kvGet<Stash>(`stash:${owner}`)) ?? { queue: [], failed: [] };
      await kvPut(`stash:${owner}`, {
        queue: [...old.queue, ...state.queue],
        failed: [...old.failed, ...state.failed],
      } satisfies Stash);
    }
    clearLocal();
  }
  const mine = await kvGet<Stash>(`stash:${me.id}`);
  if (mine) {
    await kvPut(`stash:${me.id}`, undefined);
    set({ queue: [...mine.queue, ...state.queue], failed: [...mine.failed, ...state.failed] });
  }
  set({ ownerId: me.id });
}

// ── Talking to the server ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal; keepalive?: boolean },
): Promise<T> {
  const res = await fetch(path, {
    keepalive: init?.keepalive,
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    signal: init?.signal,
  });
  noteServerTime(res);
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? `HTTP ${res.status}`);
  return data as T;
}

/**
 * How far this phone's clock is from the server's (ms). Edits are stamped with server time, so a
 * phone whose clock is off cannot win (or lose) against another phone's later edit.
 */
let skew = 0;
function noteServerTime(res: Response) {
  const d = Date.parse(res.headers.get("Date") ?? "");
  // The Date header has whole seconds: only a real difference is worth correcting.
  if (!Number.isNaN(d) && Math.abs(d - Date.now()) > 5_000) skew = d - Date.now();
  else if (!Number.isNaN(d)) skew = 0;
}
/** Now, by the server's clock as far as this phone knows it. */
export const stamp = () => new Date(Date.now() + skew).toISOString();

/** Puts the server's copy in place, keeping whatever is still waiting to go up. */
export function applySync(data: SyncData) {
  if (state.queue.length) return;
  set({
    me: data.me,
    ownerId: data.me.id,
    ...keepFailed({
      lists: data.lists,
      items: data.items,
      vintages: data.vintages,
      tastings: data.tastings,
      // An older server sends no cellar: keep the phone's.
      cellar: data.cellar ?? state.cellar,
    }),
    ...(data.cellar ? { proWindows: data.proWindows ?? [] } : {}),
    ...(data.proScores ? { proScores: data.proScores } : {}),
    syncedAt: new Date().toISOString(),
  });
}

type Records = Pick<State, "lists" | "items" | "vintages" | "tastings" | "cellar">;
const upsert = <T extends { id: string }>(list: T[], x: T | undefined): T[] =>
  !x ? list : list.some((y) => y.id === x.id) ? list.map((y) => (y.id === x.id ? x : y)) : [x, ...list];

/** The server's copy, with what the refused changes say laid over it: they must not vanish. */
function keepFailed(r: Records): Records {
  for (const { op: o } of state.failed) {
    switch (o.op) {
      case "putVintage":
        r.vintages = upsert(
          r.vintages,
          state.vintages.find((v) => v.id === o.id),
        );
        break;
      case "putTasting":
        r.tastings = upsert(r.tastings, o.tasting);
        break;
      case "putCellar":
        r.cellar = upsert(r.cellar, o.lot);
        break;
      case "putList":
        r.lists = upsert(r.lists, o.list);
        break;
      case "putItem":
        r.items = upsert(r.items, o.item);
        break;
      default:
        break;
    }
  }
  // The server only sends wines something of mine on it points at: a refused note's wine is mine still.
  const need = [
    ...state.failed.flatMap(({ op: o }) =>
      o.op === "putTasting"
        ? [o.tasting.vintageId]
        : o.op === "putCellar"
          ? [o.lot.vintageId]
          : o.op === "putItem"
            ? [o.item.vintageId]
            : [],
    ),
  ];
  for (const id of need)
    if (!r.vintages.some((v) => v.id === id))
      r.vintages = upsert(
        r.vintages,
        state.vintages.find((v) => v.id === id),
      );
  return r;
}

/** 重试: the refused changes go up again, before anything else waiting. */
export function retryFailed() {
  if (!state.failed.length) return;
  set({ queue: [...state.failed.map((f) => f.op), ...state.queue], failed: [], rejected: null });
  void flush();
}

/** 放弃: let the refused changes go; the server's copy takes their place at the next sync. */
export function dropFailed() {
  set({ failed: [], rejected: null });
  void flush();
}

let flushing: Promise<void> | null = null;
/** How many ops of the queue's head are on their way up: they must not be replaced. */
let inFlight = 0;
/** Set while the page is being hidden: the upload must survive the tab closing. */
let leaving = false;

/** Sends the queue, then fetches the server's copy. Safe to call any time. */
export function flush(): Promise<void> {
  if (flushing) return flushing;
  cancelScheduled();
  flushing = (async () => {
    try {
      while (state.queue.length && navigator.onLine !== false) {
        const batch = state.queue.slice(0, 50);
        const body = { ops: batch };
        // keepalive lets the request outlive a closed tab, but only for small bodies (64 KB).
        const keepalive = leaving && JSON.stringify(body).length < 60_000;
        inFlight = batch.length;
        let results: OpResult[];
        try {
          ({ results } = await api<{ results: OpResult[] }>("/api/ops", { body, keepalive }));
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) sessionEnded();
          else if ((navigator as { onLine?: boolean }).onLine !== false) {
            set({ stuck: true }, false);
            scheduleFlush(RETRY_MS);
          }
          return;
        } finally {
          inFlight = 0;
        }
        let rejected: string | null = null;
        const failed: FailedOp[] = [];
        const at = new Date().toISOString();
        batch.forEach((o, i) => {
          const r = results[i];
          if (o.op === "putVintage" && r?.vintageId && r.vintageId !== o.id) remapVintage(o.id, r.vintageId);
          if (r && !r.ok) {
            rejected = r.error ?? "error";
            failed.push({ op: o, error: rejected, at });
          }
        });
        // A newer copy of a refused record went up fine: the refused one is no longer needed.
        const done = new Set(batch.flatMap((o, i) => (results[i]?.ok && opKey(o) ? [opKey(o)] : [])));
        const still = state.failed.filter((f) => !done.has(opKey(f.op) ?? ""));
        set({
          queue: state.queue.slice(batch.length),
          stuck: false,
          ...(rejected || still.length !== state.failed.length ? { failed: [...still, ...failed] } : {}),
          ...(rejected ? { rejected } : {}),
        });
      }
      if (!state.queue.length && !leaving && state.me) {
        const data = await api<SyncData>("/api/sync");
        applySync(data);
        void fillLocations();
      }
    } catch {
      // offline or the server is down: try again later
    } finally {
      flushing = null;
      // Changes made while this upload was running wait for the next one.
      if (
        state.me &&
        state.queue.length &&
        !flushTimer &&
        !leaving &&
        (navigator as { onLine?: boolean }).onLine !== false
      )
        scheduleFlush(SHARED_MS);
    }
  })();
  return flushing;
}

/**
 * Changes stay on the phone (IndexedDB) and go up in batches, not on every tap:
 * - my own notes: at most PRIVATE_MS after the first unsent change, or sooner when I leave the
 *   page, finish a note (完成), or switch away from the app;
 * - anything in a list shared with others: within SHARED_MS, so friends tasting together see it.
 * The timer is not pushed back by later changes, so steady tapping still uploads on time.
 */
export const PRIVATE_MS = 30_000;
export const SHARED_MS = 3_000;
const RETRY_MS = 60_000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushDue = 0;
function scheduleFlush(ms: number) {
  const due = Date.now() + ms;
  if (flushTimer && flushDue <= due) return;
  cancelScheduled();
  flushDue = due;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, ms);
}
function cancelScheduled() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
}

/** Uploads now if anything is waiting (完成, leaving a page). */
export function flushPending() {
  if (state.queue.length) void flush();
}

addEventListener("online", () => {
  void flush();
  void fillLocations();
});
addEventListener("visibilitychange", () => {
  leaving = document.visibilityState === "hidden";
  // Coming back fetches friends' changes too; going away sends mine before the phone sleeps.
  if (!leaving) void flush();
  else flushPending();
});
addEventListener("pagehide", () => {
  leaving = true;
  flushPending();
});

/** A list with other people in it (or open to join): its changes go up quickly. */
function isSharedList(listId: string | null | undefined): boolean {
  const l = listId ? state.lists.find((x) => x.id === listId) : undefined;
  if (!l) return false;
  return (l.members ?? 1) > 1 || l.visibility === "public" || (!!l.ownerId && l.ownerId !== state.me?.id);
}
function isShared(op: Op): boolean {
  switch (op.op) {
    case "putTasting": {
      const itemId = op.tasting.listItemId;
      return !!itemId && isSharedList(state.items.find((i) => i.id === itemId)?.listId);
    }
    case "putList":
      return isSharedList(op.list.id);
    case "putItem":
      return isSharedList(op.item.listId);
    case "reorder":
      return isSharedList(op.listId);
    // Language, depth and model choices are rare and follow me to my other devices: send soon.
    case "putMe":
      return true;
    default:
      return false;
  }
}

/** Queues a change; a newer version of the same record replaces one not yet sent. */
function enqueue(op: Op, shared = isShared(op)) {
  const key = opKey(op);
  let queue = state.queue;
  if (key) {
    const at = queue.findIndex((o, i) => i >= inFlight && opKey(o) === key);
    if (at >= 0) queue = [...queue.slice(0, at), op, ...queue.slice(at + 1)];
    else queue = [...queue, op];
  } else queue = [...queue, op];
  set({ queue });
  scheduleFlush(shared ? SHARED_MS : PRIVATE_MS);
}
const opKey = (o: Op): string | null =>
  o.op === "putTasting"
    ? `t:${o.tasting.id}`
    : o.op === "putList"
      ? `l:${o.list.id}`
      : o.op === "putItem"
        ? `i:${o.item.id}`
        : o.op === "reorder"
          ? `r:${o.listId}`
          : o.op === "putCellar"
            ? `c:${o.lot.id}`
            : null;

/** The server kept another id for a wine I added: use it everywhere on the phone. */
function remapVintage(from: string, to: string) {
  const has = state.vintages.some((v) => v.id === to);
  set({
    aliases: { ...state.aliases, [from]: to },
    vintages: has
      ? state.vintages.filter((v) => v.id !== from)
      : state.vintages.map((v) => (v.id === from ? { ...v, id: to } : v)),
    items: state.items.map((i) => (i.vintageId === from ? { ...i, vintageId: to } : i)),
    tastings: state.tastings.map((t) => (t.vintageId === from ? { ...t, vintageId: to } : t)),
    cellar: state.cellar.map((l) => (l.vintageId === from ? { ...l, vintageId: to } : l)),
  });
}

// ── Changes ──────────────────────────────────────────────────────────────────────────────────

export function addVintage(v: Omit<VintageInfo, "id" | "wineId"> & { id?: string; wineId?: string }): VintageInfo {
  const existing = v.id ? state.vintages.find((x) => x.id === v.id) : undefined;
  if (existing) return existing;
  const info: VintageInfo = { ...v, ...tidyPlace(v), id: v.id ?? ulid(), wineId: v.wineId ?? "" };
  set({ vintages: [...state.vintages, info] });
  enqueue({
    op: "putVintage",
    id: info.id,
    producer: info.producer,
    wine: info.wine,
    year: info.year,
    color: info.color,
    country: info.country,
    region: info.region,
    area: info.area ?? null,
    appellation: info.appellation,
    grapes: info.grapes,
    abv: info.abv,
    lwin: info.lwin ?? null,
    place: info.place ?? null,
  });
  return info;
}

export function saveList(list: WineList) {
  const l = { ...list, updatedAt: stamp() };
  const exists = state.lists.some((x) => x.id === l.id);
  set({ lists: exists ? state.lists.map((x) => (x.id === l.id ? l : x)) : [l, ...state.lists] });
  enqueue({ op: "putList", list: l });
}

export function newList(
  title: string,
  kind: WineList["kind"],
  startsOn: string | null,
  place: WineList["place"] = null,
): WineList {
  const at = stamp();
  const l: WineList = {
    id: ulid(),
    title,
    kind,
    startsOn,
    place,
    note: null,
    createdAt: at,
    updatedAt: at,
    ownerId: state.me?.id,
    visibility: "private",
    blind: true,
    revealedAt: null,
    members: 1,
  };
  saveList(l);
  return l;
}

export function deleteList(id: string) {
  const shared = isSharedList(id);
  dropList(id);
  enqueue({ op: "deleteList", id }, shared);
}

export function addItem(listId: string, vintageId: string, blind: BlindInfo | null = null): ListItem {
  const position = Math.max(-1, ...state.items.filter((i) => i.listId === listId).map((i) => i.position)) + 1;
  const item: ListItem = {
    id: ulid(),
    listId,
    vintageId,
    position,
    priceUsd: null,
    createdAt: new Date().toISOString(),
    blind,
    answerVintageId: null,
  };
  set({ items: [...state.items, item] });
  enqueue({ op: "putItem", item });
  return item;
}

export function removeItem(id: string) {
  const shared = isSharedList(state.items.find((i) => i.id === id)?.listId);
  set({
    items: state.items.filter((i) => i.id !== id),
    tastings: state.tastings.map((t) => (t.listItemId === id ? { ...t, listItemId: null } : t)),
  });
  enqueue({ op: "deleteItem", id }, shared);
}

export function moveItem(listId: string, id: string, by: -1 | 1) {
  const items = state.items.filter((i) => i.listId === listId).sort((a, b) => a.position - b.position);
  const at = items.findIndex((i) => i.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= items.length) return;
  [items[at], items[to]] = [items[to]!, items[at]!];
  const pos = new Map(items.map((i, n) => [i.id, n]));
  set({ items: state.items.map((i) => (pos.has(i.id) ? { ...i, position: pos.get(i.id)! } : i)) });
  enqueue({ op: "reorder", listId, ids: items.map((i) => i.id) });
}

export function blankTasting(vintageId: string, listItemId: string | null, depth: Depth): Tasting {
  const at = stamp();
  return {
    id: ulid(),
    vintageId,
    listItemId,
    tastedAt: at,
    depth,
    appearance: {},
    nose: {},
    palate: {},
    extra: {},
    guesses: {},
    descriptors: [],
    quality: null,
    score: null,
    buyAgain: null,
    boughtQty: null,
    priceUsd: null,
    note: null,
    photoId: null,
    updatedAt: at,
  };
}

/** A page still holding a wine id the server has since replaced gets the kept one. */
const real = (vintageId: string) => state.aliases[vintageId] ?? vintageId;

export function saveTasting(t: Tasting) {
  const old = state.tastings.find((x) => x.id === t.id);
  const next = { ...t, vintageId: real(t.vintageId), updatedAt: stamp() };
  // A page that does not deal with the place (location undefined) keeps the one found meanwhile.
  if (next.location === undefined) next.location = old?.location;
  if (next.cellarId === undefined) next.cellarId = old?.cellarId;
  if (next.blind === undefined) next.blind = old?.blind;
  const exists = !!old;
  set({ tastings: exists ? state.tastings.map((x) => (x.id === t.id ? next : x)) : [next, ...state.tastings] });
  enqueue({ op: "putTasting", tasting: next });
}

export function deleteTasting(id: string, putBack = false) {
  if (putBack) putBackBottle(id);
  const itemId = state.tastings.find((t) => t.id === id)?.listItemId;
  const shared = isSharedList(state.items.find((i) => i.id === itemId)?.listId);
  set({ tastings: state.tastings.filter((t) => t.id !== id) });
  enqueue({ op: "deleteTasting", id }, shared);
}

// ── 盲品 (src/shared/blind.ts) ─────────────────────────────────────────────────────────────────

/** The next #n: among the 品鉴's glasses, or among my glasses on their own still waiting for 对答案. */
export function nextBlindLabel(listId: string | null): string {
  const used = listId
    ? state.items.filter((i) => i.listId === listId && i.blind).map((i) => i.blind!.label)
    : state.tastings.filter((x) => !x.listItemId && x.blind && x.vintageId === BLIND).map((x) => x.blind!.label);
  return nextLabel(used);
}

/** 盲品: a glass with no wine yet, in a 品鉴 (the host's) or on its own. Returns my note on it. */
export function startBlind(listId: string | null, blind: BlindInfo): Tasting {
  const item = listId ? addItem(listId, BLIND, blind) : null;
  const x = { ...blankTasting(BLIND, item?.id ?? null, state.me?.depth ?? "quick"), blind };
  saveTasting(x);
  return x;
}

/** 对答案 for a glass on its own: the note now belongs to that wine. */
export function answerTasting(id: string, vintageId: string) {
  const x = state.tastings.find((t) => t.id === id);
  if (x) saveTasting({ ...x, vintageId });
}

/**
 * 对答案 for a glass in a 品鉴 (the host). With `reveal` (alone, or after 揭晓) the glass and every note
 * on it become that wine at once; otherwise the answer waits, seen by the host only, for 揭晓.
 */
export function answerItem(itemId: string, vintageId: string | null, reveal: boolean) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item?.blind) return;
  const next: ListItem = {
    ...item,
    answerVintageId: vintageId,
    vintageId: reveal && vintageId ? vintageId : item.vintageId,
  };
  set({
    items: state.items.map((i) => (i.id === itemId ? next : i)),
    tastings:
      reveal && vintageId
        ? state.tastings.map((t) => (t.listItemId === itemId ? { ...t, vintageId } : t))
        : state.tastings,
  });
  enqueue({ op: "putItem", item: next }, isSharedList(item.listId));
}

// ── 酒窖 ──────────────────────────────────────────────────────────────────────────────────────

export function blankLot(vintageId: string, over: Partial<CellarLot> = {}): CellarLot {
  const at = stamp();
  return {
    id: ulid(),
    vintageId,
    qty: 1,
    sizeMl: DEFAULT_SIZE,
    location: null,
    boughtOn: at.slice(0, 10),
    price: null,
    currency: null,
    source: null,
    drinkFrom: null,
    drinkTo: null,
    note: null,
    createdAt: at,
    updatedAt: at,
    ...over,
  };
}

export function saveLot(lot: CellarLot) {
  const next = { ...lot, vintageId: real(lot.vintageId), updatedAt: stamp() };
  const exists = state.cellar.some((x) => x.id === lot.id);
  set({ cellar: exists ? state.cellar.map((x) => (x.id === lot.id ? next : x)) : [next, ...state.cellar] });
  enqueue({ op: "putCellar", lot: next });
}

export function deleteLot(id: string) {
  set({
    cellar: state.cellar.filter((l) => l.id !== id),
    tastings: state.tastings.map((t) => (t.cellarId === id ? { ...t, cellarId: null } : t)),
  });
  enqueue({ op: "deleteCellar", id });
}

/**
 * 开一瓶: one bottle fewer in the lot and, unless `note` is false, a new tasting of it that points
 * back at the lot (喝掉一瓶 = 记一杯). Returns the tasting, if one was started.
 */
export function openBottle(lotId: string, note = true): Tasting | null {
  const lot = state.cellar.find((l) => l.id === lotId);
  if (!lot || lot.qty < 1) return null;
  saveLot({ ...lot, qty: lot.qty - 1 });
  if (!note) return null;
  const x = { ...blankTasting(lot.vintageId, null, state.me?.depth ?? "quick"), cellarId: lot.id };
  saveTasting(x);
  return x;
}

/** 这瓶是从酒窖拿的: a tasting started elsewhere takes its bottle out of a lot. */
export function takeFromLot(tastingId: string, lotId: string) {
  const x = state.tastings.find((t) => t.id === tastingId);
  const lot = state.cellar.find((l) => l.id === lotId);
  if (!x || !lot || lot.qty < 1 || x.cellarId) return;
  saveLot({ ...lot, qty: lot.qty - 1 });
  saveTasting({ ...x, cellarId: lot.id });
}

/** Undoes takeFromLot / openBottle: the bottle goes back. */
export function putBackBottle(tastingId: string) {
  const x = state.tastings.find((t) => t.id === tastingId);
  const lot = x?.cellarId ? state.cellar.find((l) => l.id === x.cellarId) : undefined;
  if (!x || !lot) return;
  saveTasting({ ...x, cellarId: null });
  saveLot({ ...lot, qty: lot.qty + 1 });
}

/** Sets (or, with null, removes) where a glass was tasted. */
export function setTastingLocation(id: string, location: TastingLocation | null) {
  const x = state.tastings.find((t) => t.id === id);
  if (x) saveTasting({ ...x, location });
}

let filling = false;
/**
 * Positions saved without a network get their name and address from Google once there is one.
 * The nearest place counts as where I was when it is within the phone's accuracy (at most 150 m).
 */
export async function fillLocations() {
  if (filling || !state.me?.approved || navigator.onLine === false) return;
  filling = true;
  try {
    const todo = state.tastings.filter((x) => x.location && !x.location.geocoded && x.location.lat !== null);
    for (const x of todo.slice(0, 10)) {
      const loc = x.location!;
      const lang = state.me?.locale ?? "en";
      const r = await api<NearbyPlaces>(`/api/places/near?lat=${loc.lat}&lng=${loc.lng}&l=${lang}`);
      const reach = Math.min(150, Math.max(60, loc.accuracy ?? 0));
      const here = r.places.find((p) => p.distance !== null && p.distance <= reach && p.name);
      // Typed in the meantime, or removed: leave it.
      const now = state.tastings.find((t) => t.id === x.id)?.location;
      if (!now || now.geocoded || now.lat !== loc.lat) continue;
      setTastingLocation(x.id, {
        ...now,
        name: now.name ?? here?.name ?? null,
        address: now.address ?? here?.address ?? r.address,
        placeId: now.placeId ?? here?.id ?? null,
        geocoded: true,
      });
    }
  } catch {
    // offline or Google is down: next time
  } finally {
    filling = false;
  }
}

/** The server's answer to a change that went straight up (昵称, 头像). */
export function setMe(me: Me) {
  set({ me });
}

export function updateMe(change: { locale?: Lang; depth?: Depth; labelModel?: LabelModel; locationOn?: boolean }) {
  if (!state.me) return;
  set({ me: { ...state.me, ...change } });
  enqueue({ op: "putMe", ...change });
}

// ── Sharing (needs the network) ──────────────────────────────────────────────────────────────

/** A shared list as I may see it; `k` is the QR code's key when I have not joined yet. */
export async function fetchBoard(listId: string, k?: string | null): Promise<Board> {
  // My own unsent changes first, so the board shows them (and a brand-new list exists there).
  if (state.queue.length) await flush();
  return api<Board>(`/api/lists/${listId}/board${k ? `?k=${encodeURIComponent(k)}` : ""}`);
}

/** The owner's switches; the server answers with the list as it now is. */
export async function shareList(
  listId: string,
  change: { visibility?: Visibility; blind?: boolean; revealed?: boolean; joinOpen?: boolean; newKey?: boolean },
): Promise<Board> {
  // 揭晓 and the switches act on what everyone has sent, mine included: send it first.
  if (state.queue.length) await flush();
  const b = await api<Board>(`/api/lists/${listId}/share`, { body: change });
  // 揭晓 gave the 盲品 glasses their wines: fetch them.
  if (change.revealed) void flush();
  set({
    lists: state.lists.map((l) =>
      l.id === listId
        ? {
            ...l,
            visibility: b.list.visibility,
            blind: b.list.blind,
            revealedAt: b.list.revealedAt,
            members: b.memberCount,
          }
        : l,
    ),
  });
  return b;
}

/** 扫码加入, then my copy is fetched again so the list and its wines are on the phone. */
export async function joinList(listId: string, k: string): Promise<void> {
  await api<Board>(`/api/lists/${listId}/join`, { body: { k } });
  await flush();
}

export async function leaveList(listId: string): Promise<void> {
  await api(`/api/lists/${listId}/leave`, { body: {} });
  dropList(listId);
}

export async function removeMember(listId: string, userId: string): Promise<Board> {
  return api<Board>(`/api/lists/${listId}/members/${userId}/remove`, { body: {} });
}

/** Takes a list off the phone, keeping my notes in it as notes outside any list. */
function dropList(id: string) {
  const itemIds = new Set(state.items.filter((i) => i.listId === id).map((i) => i.id));
  set({
    lists: state.lists.filter((l) => l.id !== id),
    items: state.items.filter((i) => i.listId !== id),
    tastings: state.tastings.map((t) => (t.listItemId && itemIds.has(t.listItemId) ? { ...t, listItemId: null } : t)),
  });
}

/**
 * A QR code scanned while signed out: kept across the Google sign-in (which comes back to "/"), so
 * the app can finish joining. Only for an hour, so a forgotten one does not surprise anyone later.
 */
const JOIN_KEY = "pending_join";
export function rememberJoin(listId: string, k: string) {
  try {
    localStorage.setItem(JOIN_KEY, JSON.stringify({ listId, k, at: Date.now() }));
  } catch {
    // private mode: the friend scans again after signing in
  }
}
export function takePendingJoin(): { listId: string; k: string } | null {
  try {
    const raw = localStorage.getItem(JOIN_KEY);
    localStorage.removeItem(JOIN_KEY);
    const j = raw ? (JSON.parse(raw) as { listId: string; k: string; at: number }) : null;
    return j && Date.now() - j.at < 3600_000 ? j : null;
  } catch {
    return null;
  }
}

export const clearRejected = () => set({ rejected: null }, false);
