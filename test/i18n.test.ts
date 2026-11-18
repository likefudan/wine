/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { MESSAGES } from "../src/web/messages";

const pages = import.meta.glob("../src/web/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;
const worker = import.meta.glob("../src/worker/**/*.ts", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;
const CALL = /\b(?:t|tx|tk)\(\s*"((?:[^"\\]|\\.)*)"/g;
const SERVER = /(?:HttpError\(\d+, "[a-z_]+",\s*|fail\()"([^"]+)"/g;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  it("has 繁體 and English for every text a page shows", () => {
    const missing = Object.values(pages)
      .flatMap((src) => [...src.matchAll(CALL)].map((m) => JSON.parse(`"${m[1]}"`) as string))
      .filter((k) => !MESSAGES[k]);
    expect(missing).toEqual([]);
  });

  it("has them for every message the server sends", () => {
    const missing = Object.values(worker)
      .flatMap((src) => [...src.matchAll(SERVER)].map((m) => m[1]!))
      .filter((k) => k !== "Not found" && !MESSAGES[k]);
    expect(missing).toEqual([]);
  });

  it("keeps the placeholders in every language", () => {
    for (const [zh, m] of Object.entries(MESSAGES)) {
      expect(placeholders(m.tw), zh).toEqual(placeholders(zh));
      expect(placeholders(m.en), zh).toEqual(placeholders(zh));
    }
  });
});
