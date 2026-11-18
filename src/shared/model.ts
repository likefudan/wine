/**
 * The data both sides agree on: what a wine, a list and a tasting look like on the wire, and the
 * checks that keep them sane. The tasting fields follow the WSET systematic approach (SAT); every
 * depth writes into the same fields (docs/design.zh.md §3.3, §3.4).
 */

export const COLORS = ["red", "white", "rose", "sparkling", "dessert"] as const;
export type WineColor = (typeof COLORS)[number];

export const DEPTHS = ["quick", "beginner", "standard", "expert"] as const;
export type Depth = (typeof DEPTHS)[number];

export const LIST_KINDS = ["winery", "trip", "dinner", "home"] as const;
export type ListKind = (typeof LIST_KINDS)[number];

export const LANGS = ["zh-CN", "zh-TW", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** Five steps: low, medium-, medium, medium+, high (WSET). */
export type Level = 1 | 2 | 3 | 4 | 5;

export const HUES = {
  red: ["purple", "ruby", "garnet", "tawny"],
  white: ["lemon-green", "lemon", "gold", "amber"],
  rose: ["pink", "salmon", "orange"],
} as const;
export type Hue = (typeof HUES)[keyof typeof HUES][number];
export const ALL_HUES: readonly string[] = [...HUES.red, ...HUES.white, ...HUES.rose];

/** Which hue set a colour of wine uses: sparkling and dessert can be either, white by default. */
export const hueFamily = (color: WineColor, hue?: string): keyof typeof HUES => {
  if (hue && (HUES.red as readonly string[]).includes(hue)) return "red";
  if (hue && (HUES.rose as readonly string[]).includes(hue)) return "rose";
  if (hue && (HUES.white as readonly string[]).includes(hue)) return "white";
  return color === "red" ? "red" : color === "rose" ? "rose" : "white";
};

export const QUALITIES = ["faulty", "poor", "acceptable", "good", "very-good", "outstanding"] as const;
export const DEVELOPMENT = ["youthful", "developing", "developed", "tired"] as const;
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
  mousse?: (typeof MOUSSE)[number];
  finish?: Level;
  finishSeconds?: number;
}
export interface Extra {
  faults?: string[];
  reasons?: string[];
  drinkFrom?: number;
  drinkTo?: number;
  decantMinutes?: number;
  tempC?: number;
  glass?: string;
  dayOpen?: number;
}
export interface Guesses {
  grape?: string;
  region?: string;
  vintage?: number;
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
  updatedAt: string;
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

/** Where a 酒单 happens. `id` is set when it was picked from Google Places; typed by hand it is null. */
export interface ListPlace {
  name: string;
  id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** What /api/places looks for first: wineries, restaurants, or anything (towns, regions). */
export const PLACE_KINDS = ["winery", "restaurant", "any"] as const;
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
}

export interface ListItem {
  id: string;
  listId: string;
  vintageId: string;
  position: number;
  priceUsd: number | null;
  createdAt: string;
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
export const isLabelModel = (v: unknown): v is LabelModel => LABEL_MODELS.some((m) => m.id === v);

export interface Me {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  locale: Lang | null;
  depth: Depth | null;
  /** null = the default (LABEL_MODELS[0]). */
  labelModel: LabelModel | null;
  /** false while waiting for an owner's approval (开放注册): no label reading or place lookups. */
  approved: boolean;
  owner: boolean;
}

/** 我的 → 成员 (owners only). */
export interface Member {
  id: string;
  email: string;
  name: string | null;
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
  | { op: "putMe"; locale?: Lang; depth?: Depth; labelModel?: LabelModel };

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
