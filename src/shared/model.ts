/**
 * The data both sides agree on: what a wine, a list and a tasting look like on the wire, and the
 * checks that keep them sane. The tasting fields follow the WSET systematic approach (SAT); every
 * depth writes into the same fields (docs/design.zh.md §3.3, §3.4).
 */

import type { CellarLot, ProWindow } from "./cellar";
import type { BlindInfo } from "./blind";
import type { ProScore } from "./taste";

export const COLORS = ["red", "white", "rose", "sparkling", "dessert"] as const;
export type WineColor = (typeof COLORS)[number];

export const DEPTHS = ["quick", "beginner", "standard"] as const;
export type Depth = (typeof DEPTHS)[number];
/** A depth as stored or sent: 专业 was merged into 进阶 (2026-11-18), so an old "expert" is "standard". */
export const toDepth = (d: unknown): Depth | undefined =>
  d === "expert" ? "standard" : (DEPTHS as readonly unknown[]).includes(d) ? (d as Depth) : undefined;

/** In the order the new-list form offers them: most tastings are at a winery, fewest on a trip. */
export const LIST_KINDS = ["winery", "home", "dinner", "trip"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LANGS = ["zh-CN", "zh-TW", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** Five steps: low, medium-, medium, medium+, high (WSET). */
export type Level = 1 | 2 | 3 | 4 | 5;

export const HUES = {
  red: ["purple", "ruby", "garnet", "tawny", "brown"],
  white: ["lemon-green", "lemon", "gold", "amber", "brown"],
  rose: ["pink", "salmon", "orange"],
} as const;
export type Hue = (typeof HUES)[keyof typeof HUES][number];
export const ALL_HUES: readonly string[] = [...new Set([...HUES.red, ...HUES.white, ...HUES.rose])];

/** Which hue set a colour of wine uses: sparkling and dessert can be either, white by default. */
export const hueFamily = (color: WineColor, hue?: string): keyof typeof HUES => {
  const own = color === "red" ? "red" : color === "rose" ? "rose" : "white";
  // "brown" is in both red and white: a hue the wine's own set has wins.
  if (hue && (HUES[own] as readonly string[]).includes(hue)) return own;
  if (hue && (HUES.red as readonly string[]).includes(hue)) return "red";
  if (hue && (HUES.rose as readonly string[]).includes(hue)) return "rose";
  if (hue && (HUES.white as readonly string[]).includes(hue)) return "white";
  return color === "red" ? "red" : color === "rose" ? "rose" : "white";
};

export const QUALITIES = ["faulty", "poor", "acceptable", "good", "very-good", "outstanding"] as const;
export const DEVELOPMENT = ["youthful", "developing", "developed", "tired"] as const;
/** WSET: readiness for drinking / potential for ageing. */
export const READINESS = ["too-young", "can-age", "drink-now", "too-old"] as const;
export const TANNIN_TEXTURES = ["fine", "grainy", "coarse", "green"] as const;
export const MOUSSE = ["delicate", "creamy", "aggressive"] as const;
export const FAULTS = ["cork", "oxidised", "reduced", "brett", "va"] as const;
export const QUALITY_REASONS = ["balance", "length", "intensity", "complexity"] as const;

export interface Appearance {
  /** 1 pale, 2 medium, 3 deep */
  intensity?: 1 | 2 | 3;
  hue?: string;
  clarity?: "clear" | "hazy";
  rim?: boolean;
  legs?: boolean;
  sediment?: boolean;
}
export interface Nose {
  /** WSET 状态: clean, or unclean (a fault). */
  condition?: "clean" | "unclean";
  intensity?: Level;
  development?: (typeof DEVELOPMENT)[number];
  /** Words not in the vocabulary, as typed (专业). */
  custom?: string[];
}
export interface Palate {
  /** 1 dry … 6 luscious */
  sweetness?: 1 | 2 | 3 | 4 | 5 | 6;
  acidity?: Level;
  tannin?: Level;
  tanninTexture?: (typeof TANNIN_TEXTURES)[number];
  alcohol?: Level;
  body?: Level;
  flavour?: Level;
  /** Flavour characteristics: words from the aroma vocabulary, as tasted (WSET uses the same lexicon). */
  flavours?: string[];
  mousse?: (typeof MOUSSE)[number];
  finish?: Level;
  finishSeconds?: number;
}
export interface Extra {
  readiness?: (typeof READINESS)[number];
  faults?: string[];
  reasons?: string[];
  drinkFrom?: number;
  drinkTo?: number;
  decantMinutes?: number;
  tempC?: number;
  glass?: string;
  dayOpen?: number;
}
/** 盲品 猜一猜 (src/shared/blind.ts). Places in English, as the wines have them. */
export interface Guesses {
  grape?: string;
  country?: string;
  /** 产区 (older guesses: any place, as typed). */
  region?: string;
  /** 大区 or 子产区. */
  sub?: string;
  vintage?: number;
  /** A PRICE_BANDS id. */
  price?: string;
}

export interface TastingDescriptor {
  id: string;
  /** 1–3, set in 专业; 2 otherwise */
  intensity: number;
}

/** A tasting as the phone keeps it and sends it. */
export interface Tasting {
  id: string;
  vintageId: string;
  listItemId: string | null;
  tastedAt: string;
  depth: Depth;
  appearance: Appearance;
  nose: Nose;
  palate: Palate;
  extra: Extra;
  guesses: Guesses;
  descriptors: TastingDescriptor[];
  quality: string | null;
  score: number | null;
  buyAgain: boolean | null;
  boughtQty: number | null;
  priceUsd: number | null;
  note: string | null;
  photoId: string | null;
  /**
   * Where it was tasted (品一款 with the phone's position): private, never on a shared list's board.
   * undefined (an older app, or a page that did not touch it) keeps what the server has; null removes it.
   */
  location?: TastingLocation | null;
  /**
   * The 酒窖 lot this bottle came out of (开一瓶). undefined (an older app) keeps what the server has;
   * null: not from my cellar.
   */
  cellarId?: string | null;
  /**
   * 盲品: the glass's label and colour. While the wine is not known, vintageId is BLIND. undefined (an
   * older app) keeps what the server has.
   */
  blind?: BlindInfo | null;
  updatedAt: string;
}

/**
 * Where a glass was tasted. The position comes from the phone; the name and address from Google once
 * there is a network (`geocoded`), or as typed. A typed place may have no position.
 */
export interface TastingLocation {
  lat: number | null;
  lng: number | null;
  /** Metres, as the phone reported it. */
  accuracy: number | null;
  name: string | null;
  address: string | null;
  placeId: string | null;
  /** The name and address have been looked up (or typed): no need to ask Google again. */
  geocoded: boolean;
}

/** A sane TastingLocation from anything, or null. */
export function cleanLocation(v: unknown): TastingLocation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, lim: number) =>
    typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= lim ? x : null;
  let lat = num(o.lat, 90);
  let lng = num(o.lng, 180);
  if (lat === null || lng === null) lat = lng = null;
  const text = (x: unknown, max: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, max) : null);
  const name = text(o.name, 120);
  const address = text(o.address, 200);
  if (lat === null && !name && !address) return null;
  const acc = num(o.accuracy, 100_000);
  const placeId = typeof o.placeId === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(o.placeId) ? o.placeId : null;
  return {
    lat: lat === null ? null : Math.round(lat * 1e6) / 1e6,
    lng: lng === null ? null : Math.round(lng * 1e6) / 1e6,
    accuracy: acc === null ? null : Math.round(acc),
    name,
    address,
    placeId,
    geocoded: o.geocoded === true || lat === null,
  };
}

/** /api/places/near: what is around a position. `address` is the street address there, if Google knows it. */
export interface NearbyPlaces {
  address: string | null;
  places: (PlaceDetails & { distance: number | null })[];
}

/** A vintage with its wine and producer, flattened: what every list and search row shows. */
export interface VintageInfo {
  id: string;
  wineId: string;
  producer: string;
  wine: string;
  year: number;
  color: WineColor;
  country: string | null;
  region: string | null;
  /** 大区 (Napa Valley, Médoc); src/shared/place.ts. Older clients do not send it. */
  area?: string | null;
  appellation: string | null;
  grapes: string[];
  abv: number | null;
  /** The LWIN it was picked from, if any (only sent with putVintage). */
  lwin?: number | null;
  /** The producer's Google place, when it was picked from 酒庄地址联想. */
  place?: ProducerPlace | null;
}

/** Where a producer is: a Google Places place. */
export interface ProducerPlace {
  id: string;
  address: string;
  lat: number | null;
  lng: number | null;
}

/** /api/places: one suggestion while typing a producer. */
export interface PlaceSuggestion {
  id: string;
  name: string;
  detail: string;
}

/** /api/places/:id: the picked place. `area` is the state or province. */
export interface PlaceDetails extends ProducerPlace {
  name: string;
  country: string | null;
  area: string | null;
}

/** A wine from the public LWIN list (/api/catalog), not yet in our own catalogue. */
export interface LwinWine {
  lwin: number;
  producer: string;
  wine: string;
  color: WineColor | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
}

/**
 * Where a 酒单 happens: a name (the winery, restaurant, “my home”, a park) and an address, either of
 * them typed or picked from Google Places. `id` (and the position) come from a Google pick.
 */
export interface ListPlace {
  name: string;
  id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** What /api/places looks for first: wineries, restaurants, street addresses, or anything (parks, towns). */
export const PLACE_KINDS = ["winery", "restaurant", "address", "any"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface WineList {
  id: string;
  title: string;
  kind: ListKind;
  startsOn: string | null;
  /** Missing from changes sent by an older app: the server then keeps what it has. */
  place: ListPlace | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  /** Sharing, set by the server (POST /api/lists/:id/share); a change sent by the phone leaves them. */
  ownerId?: string;
  visibility?: Visibility;
  blind?: boolean;
  revealedAt?: string | null;
  /** How many people have joined, the owner included. */
  members?: number;
}

/** 私密: members only. 公开: anyone with the link may look, without signing in. */
export const VISIBILITIES = ["private", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** One person's note on a wine in a shared list, as others see it. */
export interface BoardNote {
  userId: string;
  name: string;
  picture: string | null;
  mine: boolean;
  depth: Depth;
  score: number | null;
  buyAgain: boolean | null;
  appearance: Appearance;
  nose: Nose;
  palate: Palate;
  descriptors: string[];
  note: string | null;
  /** 盲品: what they guessed, once the wine is revealed. */
  guesses?: Guesses;
  /** 盲品: the price they wrote down, for scoring the price guess. */
  priceUsd?: number | null;
}

export interface BoardItem {
  id: string;
  position: number;
  /** null: a 盲品 glass not revealed yet. */
  vintage: VintageInfo | null;
  blind?: BlindInfo | null;
  /** How many people have handed in a note on it. */
  rated: number;
  /** false while 先评后看 hides the others' notes: only `rated` is known. */
  open: boolean;
  avg: number | null;
  notes: BoardNote[];
}

/** A shared list as one person may see it (GET /api/lists/:id/board). */
export interface Board {
  list: {
    id: string;
    title: string;
    kind: ListKind;
    startsOn: string | null;
    place: ListPlace | null;
    note: string | null;
    ownerName: string;
    visibility: Visibility;
    blind: boolean;
    revealedAt: string | null;
    joinOpen: boolean;
  };
  signedIn: boolean;
  member: boolean;
  owner: boolean;
  /** The link in the QR code would let this person in. */
  canJoin: boolean;
  /** The QR code's key: members only. */
  key: string | null;
  memberCount: number;
  /** Members only, or everyone once the list is public and its notes open. */
  members: { id: string; name: string; picture: string | null; owner: boolean }[];
  items: BoardItem[];
}

export interface ListItem {
  id: string;
  listId: string;
  /** BLIND for a 盲品 glass whose wine has not been revealed. */
  vintageId: string;
  position: number;
  priceUsd: number | null;
  createdAt: string;
  /** 盲品: the glass's label and colour (only the host adds these). */
  blind?: BlindInfo | null;
  /** 盲品: the host's answer, sent to the host only; 揭晓 (or the host, alone) makes it the vintage. */
  answerVintageId?: string | null;
}

/**
 * The models a person can pick to read labels (设置). All are on the same Azure resource; the first is
 * the default. `api`: which protocol the Worker speaks to it.
 */
export const LABEL_MODELS = [
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", api: "anthropic" },
  { id: "claude-fable-5-2", name: "Claude Fable 5.2", api: "anthropic" },
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", api: "anthropic" },
  { id: "DeepSeek-V4.1-Flash-1017", name: "DeepSeek V4.1 Flash", api: "openai" },
] as const;
export type LabelModel = (typeof LABEL_MODELS)[number]["id"];
/** The dearest model: only owners may pick it for every label (others get the default). */
export const OWNER_ONLY_MODELS: readonly string[] = ["claude-opus-5-5"];
export const isLabelModel = (v: unknown): v is LabelModel => LABEL_MODELS.some((m) => m.id === v);

/** 头像: their own photo, the Google picture, or none on purpose. */
export type AvatarMode = "own" | "google" | "none";

export interface Me {
  id: string;
  email: string;
  /** What others see: their 昵称, else the Google name. */
  name: string | null;
  /** What others see: their own photo, else the Google picture (null = none). */
  picture: string | null;
  /** Their own name; null = the Google one. */
  nickname: string | null;
  googleName: string | null;
  googlePicture: string | null;
  avatarMode: AvatarMode;
  locale: Lang | null;
  depth: Depth | null;
  /** null = the default (LABEL_MODELS[0]). */
  labelModel: LabelModel | null;
  /** 记下品酒地点 when starting a note: null = not asked yet. */
  locationOn: boolean | null;
  /** false while waiting for an owner's approval (开放注册): no label reading or place lookups. */
  approved: boolean;
  owner: boolean;
}

/** 我的 → 成员 (owners only). */
export interface Member {
  id: string;
  email: string;
  /** Their 昵称, else the Google name. */
  name: string | null;
  /** The Google name, when they chose another. */
  googleName: string | null;
  picture: string | null;
  status: "active" | "pending" | "disabled";
  createdAt: string;
  approvedBy: string | null;
}

/** Everything of one person's, for the phone's own copy (GET /api/sync). */
export interface SyncData {
  me: Me;
  lists: WineList[];
  items: ListItem[];
  vintages: VintageInfo[];
  tastings: Tasting[];
  /** 酒窖 (src/shared/cellar.ts). Missing from an older server. */
  cellar?: CellarLot[];
  /** The critics' drinking window for wines in my cellar, from the pro-review lookups. */
  proWindows?: ProWindow[];
  /** The critics' scores on wines I have tasted or keep (推荐: 我与评论家). Missing from an older server. */
  proScores?: ProScore[];
}

/** One change made on the phone, sent in order and safe to send twice (POST /api/ops). */
export type Op =
  | {
      op: "putVintage";
      id: string;
      producer: string;
      wine: string;
      year: number;
      color: WineColor;
      country?: string | null;
      region?: string | null;
      area?: string | null;
      appellation?: string | null;
      grapes?: string[];
      abv?: number | null;
      lwin?: number | null;
      place?: ProducerPlace | null;
    }
  | { op: "putList"; list: WineList }
  | { op: "deleteList"; id: string }
  | { op: "putItem"; item: ListItem }
  | { op: "deleteItem"; id: string }
  | { op: "reorder"; listId: string; ids: string[] }
  | { op: "putTasting"; tasting: Tasting }
  | { op: "deleteTasting"; id: string }
  | { op: "putCellar"; lot: CellarLot }
  | { op: "deleteCellar"; id: string }
  | { op: "putMe"; locale?: Lang; depth?: Depth; labelModel?: LabelModel; locationOn?: boolean };

export interface OpResult {
  ok: boolean;
  /** putVintage: the id kept, when the wine already existed under another id. */
  vintageId?: string;
  error?: string;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** A ULID: sortable by time, made without asking the server. */
export function ulid(time = Date.now()): string {
  let t = time,
    head = "";
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[t % 32] + head;
    t = Math.floor(t / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let tail = "";
  for (const b of bytes) tail += CROCKFORD[b % 32];
  return head + tail;
}
export const ID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Producer words that don't tell two producers apart (docs/design.zh.md §3.1). */
const NOISE =
  /\b(winery|wines|wine|vineyards?|cellars?|estates?|estate|domaine|chateau|château|bodegas?|cantina|weingut|tenuta|the|de|du|la|le)\b/g;

/** The key two spellings of one name share: lower case, no accents, no punctuation or filler words. */
export function nameKey(name: string, producer = false): string {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ");
  if (producer) {
    const stripped = s.replace(NOISE, " ").replace(/\s+/g, " ").trim();
    if (stripped) s = stripped;
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * The words a search for `q` looks up in the LWIN word index: nameKey() words without the filler ones,
 * as scripts/lwin_import.py makes them. Falls back to every word when all of them are filler.
 */
export function searchWords(q: string): string[] {
  const all = nameKey(q).split(" ").filter(Boolean);
  const kept = all.filter((w) => !w.match(new RegExp(`^(?:${NOISE.source})$`)) && w.length >= 2);
  return (kept.length ? kept : all).slice(0, 4);
}

export const MIN_SCORE = 50;
export const MAX_SCORE = 100;

/** "2019", or NV. */
export const yearLabel = (year: number) => (year === 0 ? "NV" : String(year));

export const clampText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

/**
 * 朋友动态 (GET /api/friends): a note handed in by someone I share a 品鉴 with, on a wine in that
 * 品鉴. Only what the list's board would show me: while 先评后看 hides it (`open` false) the score,
 * aromas and words stay on the server. Where it was tasted is never sent.
 */
export interface FriendNote {
  id: string;
  list: { id: string; title: string };
  itemId: string;
  vintage: VintageInfo;
  user: { id: string; name: string; picture: string | null };
  /** When they last changed it: the feed's order, and the cursor for the next page. */
  at: string;
  open: boolean;
  depth: Depth | null;
  score: number | null;
  buyAgain: boolean | null;
  descriptors: string[];
  note: string | null;
}

export interface FriendFeed {
  notes: FriendNote[];
  /** Pass as ?before= for older notes; null when there are none. */
  next: string | null;
}

/** 昵称 (Ke Li 2026-11-18): at most this many characters. */
export const NICKNAME_MAX = 20;

/**
 * A nickname (trimmed, not empty): letters of any language, digits, spaces and . - _ ' ( ) ·,
 * starting with a letter or digit — so no emoji, line breaks or a name of only dots (the badminton
 * site's checkNameChars(), widened past 中文/English for names like José or 정민).
 */
export function checkNickname(name: string): string | null {
  if ([...name].length > NICKNAME_MAX) return "昵称最多 20 个字";
  if (!/^[\p{L}\p{M}\p{N} ._\-'’()（）·・]*$/u.test(name)) return "昵称只能用文字、数字、空格和 . - _ ' ( ) ·";
  if (!/^[\p{L}\p{N}]/u.test(name)) return "昵称要以文字或数字开头";
  if (/\s{2,}/.test(name)) return "昵称里不要连着打空格";
  return null;
}
