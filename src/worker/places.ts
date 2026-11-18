import { Hono } from "hono";
import type { PlaceDetails, PlaceSuggestion } from "../shared/model";
import { requireApproved, requireUser } from "./auth";
import type { Env } from "./env";

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

async function autocomplete(key: string, body: object): Promise<Prediction[]> {
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

/** Wineries first; when none match (a producer Google files as a shop or a farm), any place. */
export async function suggestPlaces(env: Env, q: string, session: string): Promise<PlaceSuggestion[]> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key || q.trim().length < 2) return [];
  const base = { input: q.trim().slice(0, 120), sessionToken: SESSION_RE.test(session) ? session : undefined };
  try {
    let found = await autocomplete(key, { ...base, includedPrimaryTypes: ["winery"] });
    if (!found.length) found = await autocomplete(key, base);
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
export async function placeDetails(env: Env, id: string, session: string): Promise<PlaceDetails | null> {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key || !ID_RE.test(id)) return null;
  const qs = SESSION_RE.test(session) ? `?sessionToken=${encodeURIComponent(session)}` : "";
  try {
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
      addressComponents?: { longText: string; types: string[] }[];
      location?: { latitude: number; longitude: number };
    };
    const part = (type: string) => p.addressComponents?.find((c) => c.types.includes(type))?.longText ?? null;
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

placesRoutes.get("/places", async (c) => {
  requireApproved(c.env, await requireUser(c));
  return c.json({ places: await suggestPlaces(c.env, c.req.query("q") ?? "", c.req.query("s") ?? "") });
});

placesRoutes.get("/places/:id", async (c) => {
  requireApproved(c.env, await requireUser(c));
  return c.json({ place: await placeDetails(c.env, c.req.param("id"), c.req.query("s") ?? "") });
});
