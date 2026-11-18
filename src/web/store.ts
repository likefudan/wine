import { useEffect, useState } from "preact/hooks";
import { tidyPlace } from "../shared/place";
import {
  type Board,
  type Depth,
  type LabelModel,
  type Lang,
  type ListItem,
  type Me,
  type Op,
  type OpResult,
  type SyncData,
  type Tasting,
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
      const { rejected: _, ...keep } = state;
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
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(path, {
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

/** Sends the queue, then fetches the server's copy. Safe to call any time. */
export function flush(): Promise<void> {
  flushing ??= (async () => {
    try {
      while (state.queue.length && navigator.onLine !== false) {
        const batch = state.queue.slice(0, 50);
        inFlight = batch.length;
        let results: OpResult[];
        try {
          ({ results } = await api<{ results: OpResult[] }>("/api/ops", { body: { ops: batch } }));
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) set({ me: null });
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
        set({ queue: state.queue.slice(batch.length), ...(rejected ? { rejected } : {}) });
      }
      if (!state.queue.length) {
        const data = await api<SyncData>("/api/sync");
        applySync(data);
      }
    } catch {
      // offline or the server is down: try again later
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 800);
}

addEventListener("online", () => void flush());
addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void flush();
});

/** Queues a change; a newer version of the same record replaces one not yet sent. */
function enqueue(op: Op) {
  const key = opKey(op);
  let queue = state.queue;
  if (key) {
    const at = queue.findIndex((o, i) => i >= inFlight && opKey(o) === key);
    if (at >= 0) queue = [...queue.slice(0, at), op, ...queue.slice(at + 1)];
    else queue = [...queue, op];
  } else queue = [...queue, op];
  set({ queue });
  scheduleFlush();
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
  dropList(id);
  enqueue({ op: "deleteList", id });
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
  set({
    items: state.items.filter((i) => i.id !== id),
    tastings: state.tastings.map((t) => (t.listItemId === id ? { ...t, listItemId: null } : t)),
  });
  enqueue({ op: "deleteItem", id });
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
  const next = { ...t, vintageId: real(t.vintageId), updatedAt: new Date().toISOString() };
  const exists = state.tastings.some((x) => x.id === t.id);
  set({ tastings: exists ? state.tastings.map((x) => (x.id === t.id ? next : x)) : [next, ...state.tastings] });
  enqueue({ op: "putTasting", tasting: next });
}

export function deleteTasting(id: string) {
  set({ tastings: state.tastings.filter((t) => t.id !== id) });
  enqueue({ op: "deleteTasting", id });
}

export function updateMe(change: { locale?: Lang; depth?: Depth; labelModel?: LabelModel }) {
  if (!state.me) return;
  set({ me: { ...state.me, ...change } });
  enqueue({ op: "putMe", ...change });
}

// ── Sharing (needs the network) ──────────────────────────────────────────────────────────────

/** A shared list as I may see it; `k` is the QR code's key when I have not joined yet. */
export const fetchBoard = (listId: string, k?: string | null) =>
  api<Board>(`/api/lists/${listId}/board${k ? `?k=${encodeURIComponent(k)}` : ""}`);

/** The owner's switches; the server answers with the list as it now is. */
export async function shareList(
  listId: string,
  change: { visibility?: Visibility; blind?: boolean; revealed?: boolean; joinOpen?: boolean; newKey?: boolean },
): Promise<Board> {
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
