import { type Context, Hono } from "hono";
import {
  type NearbyPlaces,
  PLACE_KINDS,
  type PlaceDetails,
  type PlaceKind,
  type PlaceSuggestion,
} from "../shared/model";
import { requireApproved, requireUser } from "./auth";
import { logCall, requireBudget } from "./costs";
import type { Env } from "./env";
import { HttpError } from "./http";

/**
 * 酒庄地址联想: Google Places (New) looked up on the server, so the key never reaches the browser
 * (the same way as jaysbadminton's venue addresses). Wineries anywhere in the world; without
 * GOOGLE_MAPS_API_KEY the field is plain text.
 */
export const placesRoutes = new Hono<{ Bindings: Env }>();

const TIMEOUT_MS = 4_000;
const ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const SESSION_RE = /^[A-Za-z0-9-]{8,64}$/;

interface Prediction {
  placeId: string;
  text: { text: string };
  structuredFormat?: { mainText: { text: string }; secondaryText?: { text: string } };
}

async function autocomplete(key: string, body: object, meter: string[]): Promise<Prediction[]> {
  meter.push("google-places-autocomplete");
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error("places autocomplete failed:", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  const json = (await res.json()) as { suggestions?: { placePrediction?: Prediction }[] };
  return (json.suggestions ?? []).flatMap((s) => (s.placePrediction ? [s.placePrediction] : []));
}

/**
 * Wineries (or restaurants) first; when none match (a producer Google files as a shop or a farm), any
 * place. `address` looks for street addresses first; `any` (a park, a town) asks once, for anything.
 */
export async function suggestPlaces(
  env: Env,
  q: string,
  session: string,
  kind: PlaceKind = "winery",
  meter: string[] = [],
): Promise<PlaceSuggestion[]> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key || q.trim().length < 2) return [];
  const base = { input: q.trim().slice(0, 120), sessionToken: SESSION_RE.test(session) ? session : undefined };
  try {
    const types = kind === "address" ? ["street_address", "premise", "subpremise"] : kind === "any" ? null : [kind];
    let found = types ? await autocomplete(key, { ...base, includedPrimaryTypes: types }, meter) : [];
    if (!found.length) found = await autocomplete(key, base, meter);
    return found.slice(0, 5).map((p) => ({
      id: p.placeId,
      name: p.structuredFormat?.mainText.text ?? p.text.text,
      detail: p.structuredFormat?.secondaryText?.text ?? "",
    }));
  } catch (err) {
    console.error("places autocomplete failed:", err);
    return [];
  }
}

/** Name, address, country and position of a picked suggestion; ends Google's billing session. */
export async function placeDetails(
  env: Env,
  id: string,
  session: string,
  meter: string[] = [],
): Promise<PlaceDetails | null> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key || !ID_RE.test(id)) return null;
  const qs = SESSION_RE.test(session) ? `?sessionToken=${encodeURIComponent(session)}` : "";
  try {
    meter.push("google-place-details");
    const res = await fetch(`https://places.googleapis.com/v1/places/${id}${qs}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,addressComponents,location",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const p = (await res.json()) as {
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      // Google leaves `types` out of a part that has none.
      addressComponents?: { longText: string; types?: string[] }[];
      location?: { latitude: number; longitude: number };
    };
    const part = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? null;
    return {
      id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      country: part("country"),
      area: part("administrative_area_level_1"),
      lat: p.location?.latitude ?? null,
      lng: p.location?.longitude ?? null,
    };
  } catch (err) {
    console.error("place details failed:", err);
    return null;
  }
}

interface NearbyRaw {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  // Google leaves `types` out of a part that has none.
  addressComponents?: { longText: string; types?: string[] }[];
  location?: { latitude: number; longitude: number };
}

/** Metres between two positions (haversine). */
export function distance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(a))));
}

async function searchNearby(
  key: string,
  lat: number,
  lng: number,
  radius: number,
  types: string[] | null,
  meter: string[],
) {
  meter.push("google-places-nearby");
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location",
    },
    body: JSON.stringify({
      ...(types ? { includedTypes: types } : {}),
      maxResultCount: 8,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error("places nearby failed:", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  return ((await res.json()) as { places?: NearbyRaw[] }).places ?? [];
}

/** The street address at a position (Geocoding API); null when it is not enabled for the key or finds nothing. */
async function reverseGeocode(
  key: string,
  lat: number,
  lng: number,
  lang: string,
  meter: string[],
): Promise<string | null> {
  meter.push("google-geocode");
  const qs = new URLSearchParams({ latlng: `${lat},${lng}`, key, language: lang });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { status: string; results?: { formatted_address: string }[] };
  if (json.status !== "OK") {
    if (json.status !== "ZERO_RESULTS") console.error("reverse geocode:", json.status);
    return null;
  }
  return json.results?.[0]?.formatted_address ?? null;
}

/**
 * What is around the phone: the street address and the nearest places, closest first. Used to fill in
 * where a glass was tasted and to suggest a 酒单's place. `kind` puts wineries or restaurants first.
 */
export async function nearbyPlaces(
  env: Env,
  lat: number,
  lng: number,
  kind: PlaceKind | null,
  lang = "en",
  meter: string[] = [],
): Promise<NearbyPlaces> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) return { address: null, places: [] };
  const types = kind === "winery" ? ["winery"] : kind === "restaurant" ? ["restaurant", "bar"] : null;
  const [address, found] = await Promise.all([
    reverseGeocode(key, lat, lng, lang, meter).catch(() => null),
    (async () => {
      try {
        // Wineries (restaurants) within a few hundred metres first; else anything close by.
        const first = types ? await searchNearby(key, lat, lng, 1_000, types, meter) : [];
        return first.length ? first : await searchNearby(key, lat, lng, 300, null, meter);
      } catch (err) {
        console.error("places nearby failed:", err);
        return [];
      }
    })(),
  ]);
  const places = found.map((p) => {
    const part = (type: string) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText ?? null;
    const plat = p.location?.latitude ?? null;
    const plng = p.location?.longitude ?? null;
    return {
      id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      country: part("country"),
      area: part("administrative_area_level_1"),
      lat: plat,
      lng: plng,
      distance: plat === null || plng === null ? null : distance(lat, lng, plat, plng),
    };
  });
  // Without the Geocoding API, the address of a place right here will do.
  const near = places.find((p) => p.distance !== null && p.distance <= 150 && p.address);
  return { address: address ?? near?.address ?? null, places };
}

/** Google calls a person may make in a day (each is billed; the 开销 page shows them as places). */
export const DAILY_PLACES_LIMIT = 300;

/** Signed in, approved and under today's allowance; the calls made are written down afterwards. */
async function placesUser(c: Context<{ Bindings: Env }>) {
  const user = await requireUser(c);
  requireApproved(c.env, user);
  const since = new Date(Date.now() - 86400_000).toISOString();
  const used = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM ai_calls WHERE user_id = ? AND feature = 'places' AND created_at > ?",
  )
    .bind(user.id, since)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= DAILY_PLACES_LIMIT)
    throw new HttpError(429, "places_limit", "今天查地点的次数用完了，可以直接输入文字");
  await requireBudget(c.env, user);
  return user;
}

const logPlaces = (env: Env, userId: string, meter: string[], ok = true) =>
  Promise.all(
    meter.map((model) =>
      logCall(env, { userId, feature: "places", model, ok, usage: { input: 0, output: 0, searches: 1 } }),
    ),
  );

placesRoutes.get("/places/near", async (c) => {
  const user = await placesUser(c);
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return c.json({ address: null, places: [] });
  const t = c.req.query("t") ?? "";
  const kind = (PLACE_KINDS as readonly string[]).includes(t) ? (t as PlaceKind) : null;
  const lang = /^[a-z]{2}(-[A-Z]{2})?$/.test(c.req.query("l") ?? "") ? c.req.query("l")! : "en";
  const meter: string[] = [];
  try {
    const found = await nearbyPlaces(c.env, lat, lng, kind, lang, meter);
    await logPlaces(c.env, user.id, meter);
    return c.json(found);
  } catch (err) {
    // Google was asked (and bills) even when its answer could not be read: 开销 shows these as failed.
    console.error("places near failed:", err);
    await logPlaces(c.env, user.id, meter, false);
    throw err;
  }
});

placesRoutes.get("/places", async (c) => {
  const user = await placesUser(c);
  const t = c.req.query("t") ?? "";
  const kind = (PLACE_KINDS as readonly string[]).includes(t) ? (t as PlaceKind) : "winery";
  const meter: string[] = [];
  const places = await suggestPlaces(c.env, c.req.query("q") ?? "", c.req.query("s") ?? "", kind, meter);
  await logPlaces(c.env, user.id, meter);
  return c.json({ places });
});

placesRoutes.get("/places/:id", async (c) => {
  const user = await placesUser(c);
  const meter: string[] = [];
  const place = await placeDetails(c.env, c.req.param("id"), c.req.query("s") ?? "", meter);
  await logPlaces(c.env, user.id, meter);
  return c.json({ place });
});
