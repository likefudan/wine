import { useEffect, useState } from "preact/hooks";
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
  queue: Op[];
  syncedAt: string | null;
  /** The last change the server refused, to show once. */
  rejected: string | null;
  /** Wine ids the server replaced with the one it already had (remapVintage). */
  aliases: Record<string, string>;
  /** Uploading failed while online (server down, not just no signal); cleared by the next success. */
  stuck: boolean;
}

const EMPTY: State = {
  me: null,
  lists: [],
  items: [],
  vintages: [],
  tastings: [],
  queue: [],
  syncedAt: null,
  rejected: null,
  aliases: {},
  stuck: false,
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
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? `HTTP ${res.status}`);
  return data as T;
}

/** Puts the server's copy in place, keeping whatever is still waiting to go up. */
export function applySync(data: SyncData) {
  if (state.queue.length) return;
  set({
    me: data.me,
    lists: data.lists,
    items: data.items,
    vintages: data.vintages,
    tastings: data.tastings,
    syncedAt: new Date().toISOString(),
  });
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
          if (e instanceof ApiError && e.status === 401) set({ me: null });
          else if ((navigator as { onLine?: boolean }).onLine !== false) {
            set({ stuck: true }, false);
            scheduleFlush(RETRY_MS);
          }
          return;
        } finally {
          inFlight = 0;
        }
        let rejected: string | null = null;
        batch.forEach((o, i) => {
          const r = results[i];
          if (o.op === "putVintage" && r?.vintageId && r.vintageId !== o.id) remapVintage(o.id, r.vintageId);
          if (r && !r.ok) rejected = r.error ?? "error";
        });
        set({ queue: state.queue.slice(batch.length), stuck: false, ...(rejected ? { rejected } : {}) });
      }
      if (!state.queue.length && !leaving) {
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
  const l = { ...list, updatedAt: new Date().toISOString() };
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
  const at = new Date().toISOString();
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

export function addItem(listId: string, vintageId: string): ListItem {
  const position = Math.max(-1, ...state.items.filter((i) => i.listId === listId).map((i) => i.position)) + 1;
  const item: ListItem = {
    id: ulid(),
    listId,
    vintageId,
    position,
    priceUsd: null,
    createdAt: new Date().toISOString(),
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
  const at = new Date().toISOString();
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
  const next = { ...t, vintageId: real(t.vintageId), updatedAt: new Date().toISOString() };
  // A page that does not deal with the place (location undefined) keeps the one found meanwhile.
  if (next.location === undefined) next.location = old?.location;
  const exists = !!old;
  set({ tastings: exists ? state.tastings.map((x) => (x.id === t.id ? next : x)) : [next, ...state.tastings] });
  enqueue({ op: "putTasting", tasting: next });
}

export function deleteTasting(id: string) {
  const itemId = state.tastings.find((t) => t.id === id)?.listItemId;
  const shared = isSharedList(state.items.find((i) => i.id === itemId)?.listId);
  set({ tastings: state.tastings.filter((t) => t.id !== id) });
  enqueue({ op: "deleteTasting", id }, shared);
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
