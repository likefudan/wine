/// <reference types="vite/client" />
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CSP, SECURITY_HEADERS } from "../src/worker/headers";
import HEADERS from "../src/web/public/_headers?raw";

describe("security headers", () => {
  it("sends them on pages and answers the Worker makes", async () => {
    for (const path of ["/api/health", "/api/sync", "/api/nope"]) {
      const res = await exports.default.fetch(`https://wine.test${path}`);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(k), `${path} ${k}`).toBe(v);
    }
  });

  it("uses the same policy for files served without the Worker", () => {
    expect(HEADERS).toContain(`Content-Security-Policy: ${CSP}\n`);
  });
});
