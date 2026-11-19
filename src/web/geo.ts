import type { NearbyPlaces, PlaceKind, TastingLocation } from "../shared/model";
import { api, fillLocations, getState, setTastingLocation } from "./store";

/**
 * The phone's position (Location Services), through the browser. The browser asks for permission the
 * first time; a refusal, a timeout or no GPS all just mean "no position".
 */
export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export const canLocate = () => typeof navigator !== "undefined" && "geolocation" in navigator;

/** "denied" when the person has said no to this site: asking again shows nothing, so don't. */
export async function locationPermission(): Promise<PermissionState | "unknown"> {
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return p?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function getPosition(timeoutMs = 15_000): Promise<Position | null> {
  if (!canLocate()) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** What is around a position (needs the network and an approved account). */
export const lookupNear = (pos: { lat: number; lng: number }, kind?: PlaceKind) =>
  api<NearbyPlaces>(
    `/api/places/near?lat=${pos.lat}&lng=${pos.lng}${kind ? `&t=${kind}` : ""}&l=${getState().me?.locale ?? "en"}`,
  );

const locating = new Set<string>();
/** Notes whose place was typed or removed by hand while the phone was still looking. */
const handled = new Set<string>();
export const stopLocating = (id: string) => handled.add(id);
/**
 * 品一款: notes where this glass is being tasted. The position is kept at once (no network needed);
 * the name and address follow from Google when online (fillLocations). Returns false with no position.
 */
export async function locateTasting(id: string): Promise<boolean> {
  if (locating.has(id)) return false;
  locating.add(id);
  try {
    const pos = await getPosition();
    // Removed or typed while the phone was looking: leave it.
    const x = getState().tastings.find((t) => t.id === id);
    if (!pos || !x || x.location || handled.has(id)) return false;
    const loc: TastingLocation = {
      lat: pos.lat,
      lng: pos.lng,
      accuracy: pos.accuracy,
      name: null,
      address: null,
      placeId: null,
      geocoded: false,
    };
    setTastingLocation(id, loc);
    void fillLocations();
    return true;
  } finally {
    locating.delete(id);
  }
}
