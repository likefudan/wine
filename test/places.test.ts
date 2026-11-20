import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/worker/env";
import { nearbyPlaces } from "../src/worker/places";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

describe("places around the phone", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads Google's answer when a part of an address has no types", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("geocode")
        ? json({ status: "OK", results: [{ formatted_address: "1 Main St, Napa, CA" }] })
        : json({
            places: [
              {
                id: "p1",
                displayName: { text: "Cellar Door" },
                formattedAddress: "3 Main St, Napa, CA",
                // Google leaves `types` out when it has none for a part.
                addressComponents: [
                  { longText: "Suite 2" },
                  { longText: "California", types: ["administrative_area_level_1", "political"] },
                  { longText: "United States", types: ["country", "political"] },
                ],
                location: { latitude: 38.2975, longitude: -122.2869 },
              },
            ],
          }),
    );
    const found = await nearbyPlaces({ GOOGLE_MAPS_API_KEY: "k" } as Env, 38.2975, -122.287, null, "en");
    expect(found.address).toBe("1 Main St, Napa, CA");
    expect(found.places).toMatchObject([
      { id: "p1", name: "Cellar Door", country: "United States", area: "California" },
    ]);
  });
});
