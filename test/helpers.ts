import { exports } from "cloudflare:workers";
import { type Op, type Tasting, ulid } from "../src/shared/model";

export const ORIGIN = "https://wine.test";

/** Keeps the session cookie between calls, like a browser. */
export class Client {
  cookie = "";

  async call<T = any>(path: string, body?: unknown, method?: string): Promise<{ status: number; data: T }> {
    const res = await exports.default.fetch(`${ORIGIN}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Origin: ORIGIN,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0]!;
    return { status: res.status, data: (await res.json()) as T };
  }

  ops(ops: Op[]) {
    return this.call<{ results: { ok: boolean; vintageId?: string; error?: string }[] }>("/api/ops", { ops });
  }
}

export async function signIn(email = "owner@example.com") {
  const c = new Client();
  const r = await c.call("/api/auth/dev", { email });
  if (r.status !== 200) throw new Error(JSON.stringify(r.data));
  return c;
}

export const vintageOp = (
  over: Partial<Extract<Op, { op: "putVintage" }>> = {},
): Extract<Op, { op: "putVintage" }> => ({
  op: "putVintage",
  id: ulid(),
  producer: "Ridge Vineyards",
  wine: "Monte Bello",
  year: 2019,
  color: "red",
  region: "Santa Cruz Mountains",
  country: "USA",
  grapes: ["Cabernet Sauvignon"],
  ...over,
});

export function tasting(vintageId: string, over: Partial<Tasting> = {}): Tasting {
  const at = new Date().toISOString();
  return {
    id: ulid(),
    vintageId,
    listItemId: null,
    tastedAt: at,
    depth: "standard",
    appearance: { hue: "ruby", intensity: 3 },
    nose: { intensity: 4 },
    palate: { tannin: 5, acidity: 4 },
    extra: {},
    guesses: {},
    descriptors: [{ id: "blackcurrant", intensity: 2 }],
    quality: "very-good",
    score: 93,
    buyAgain: true,
    boughtQty: 2,
    priceUsd: 95,
    note: "Lots of cassis",
    photoId: null,
    updatedAt: at,
    ...over,
  };
}
