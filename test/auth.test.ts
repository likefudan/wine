import { describe, expect, it } from "vitest";
import { redirectUri } from "../src/worker/auth";

describe("where Google sends a visitor back", () => {
  const env = { SITE_ORIGIN: "https://airoma.llmat.dev", OLD_ORIGIN: "https://wine.llmat.dev" };

  it("is the address they signed in from, new or old", () => {
    expect(redirectUri(env, "https://airoma.llmat.dev/api/auth/google")).toBe(
      "https://airoma.llmat.dev/api/auth/google/callback",
    );
    expect(redirectUri(env, "https://wine.llmat.dev/api/auth/google/callback?code=1")).toBe(
      "https://wine.llmat.dev/api/auth/google/callback",
    );
  });

  it("is the site's own for any other host, and when there is no old address", () => {
    expect(redirectUri(env, "https://evil.example/api/auth/google")).toBe(
      "https://airoma.llmat.dev/api/auth/google/callback",
    );
    expect(redirectUri({ SITE_ORIGIN: "http://localhost:8787" }, "http://127.0.0.1:8787/api/auth/google")).toBe(
      "http://localhost:8787/api/auth/google/callback",
    );
  });
});
