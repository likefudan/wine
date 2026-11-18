import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { bucketOf, costOf, fmtUsd, recentKeys, rollUp } from "../src/shared/costs";
import { claudeUsage, logCall } from "../src/worker/costs";
import { signIn } from "./helpers";

const SONNET = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5, searchPerK: 10 };

describe("cost arithmetic", () => {
  it("prices tokens per million and searches per thousand", () => {
    expect(costOf(SONNET, { input: 1_000_000, output: 100_000 })).toBeCloseTo(3);
    expect(costOf(SONNET, { input: 0, output: 0, cacheRead: 1_000_000, searches: 5 })).toBeCloseTo(0.15);
    expect(costOf(null, { input: 5, output: 5 })).toBe(0);
  });

  it("reads Anthropic usage, web searches included", () => {
    expect(
      claudeUsage({
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: null,
        server_tool_use: { web_search_requests: 4 },
      }),
    ).toEqual({ input: 10, output: 20, cacheRead: 3, cacheWrite: 0, searches: 4 });
  });

  it("buckets days into months, quarters and years", () => {
    expect(bucketOf("2026-11-18", "month")).toBe("2026-11");
    expect(bucketOf("2026-03-31", "quarter")).toBe("2026-Q1");
    expect(bucketOf("2026-10-01", "quarter")).toBe("2026-Q4");
    expect(recentKeys("day", "2026-03-01", 3)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(recentKeys("month", "2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(recentKeys("quarter", "2026-02-10", 3)).toEqual(["2025-Q3", "2025-Q4", "2026-Q1"]);
    expect(fmtUsd(0.00123)).toBe("$0.0012");
    expect(fmtUsd(1234.5)).toBe("$1,234.50");
  });

  it("rolls daily sums up, empty buckets included", () => {
    const day = (d: string, feature: string, model: string, cost: number) => ({
      day: d,
      feature,
      model,
      calls: 1,
      failed: 0,
      input: 100,
      output: 10,
      searches: 0,
      cost,
    });
    const days = [
      day("2019-06-01", "label", "a", 9),
      day("2026-10-02", "label", "a", 1),
      day("2026-11-01", "review", "b", 2),
      day("2026-11-18", "label", "b", 0.5),
    ];
    const months = rollUp(days, "month", "2026-11-18");
    expect(months).toHaveLength(12);
    const nov = months.at(-1)!;
    expect([nov.key, nov.cost, nov.calls]).toEqual(["2026-11", 2.5, 2]);
    expect(nov.byFeature).toEqual({ review: { cost: 2, calls: 1 }, label: { cost: 0.5, calls: 1 } });
    expect(nov.byModel.b).toEqual({ cost: 2.5, calls: 2 });
    expect(months.at(-2)!.cost).toBe(1);
    expect(rollUp(days, "day", "2026-11-18")).toHaveLength(30);
    // 年 keeps years older than the window, so nothing is lost.
    const years = rollUp(days, "year", "2026-11-18");
    expect(years.map((y) => y.key)).toEqual(["2019", "2022", "2023", "2024", "2025", "2026"]);
    expect(years[0]!.cost).toBe(9);
  });
});

describe("模型开销", () => {
  it("logs each call with its cost and shows owners the daily sums", async () => {
    const owner = await signIn("owner@example.com");
    const me = (await owner.call("/api/auth/session")).data.me;
    await logCall(env, {
      userId: me.id,
      feature: "label",
      model: "claude-sonnet-5-5",
      usage: { input: 1_000_000, output: 100_000 },
    });
    await logCall(env, {
      userId: me.id,
      feature: "review",
      model: "claude-opus-5-5",
      usage: { input: 10_000, output: 1000, searches: 3 },
      ok: false,
    });
    await logCall(env, { userId: null, feature: "prose", model: "mystery-model", usage: { input: 5, output: 5 } });

    const r = await owner.call("/api/admin/costs?tz=-480");
    expect(r.status).toBe(200);
    const days = r.data.days as { feature: string; cost: number; calls: number; failed: number; searches: number }[];
    const by = Object.fromEntries(days.map((d) => [d.feature, d]));
    expect(by.label!.cost).toBeCloseTo(3);
    // Opus 5.5: 10k in × $4 + 1k out × $20 + 3 searches × $10/1000.
    expect(by.review!.cost).toBeCloseTo(0.04 + 0.02 + 0.03);
    expect([by.review!.failed, by.review!.searches]).toEqual([1, 3]);
    expect(by.prose!.cost).toBe(0);

    const prices = (await owner.call("/api/admin/prices")).data;
    expect(prices.prices.map((p: { model: string }) => p.model)).toContain("claude-sonnet-5-5");
    expect(prices.unpriced).toEqual(["mystery-model"]);
  });

  it("lets owners change prices and work past calls out again", async () => {
    const owner = await signIn("owner@example.com");
    await logCall(env, {
      userId: null,
      feature: "prose",
      model: "mystery-model",
      usage: { input: 1_000_000, output: 0 },
    });
    expect(
      (await owner.call("/api/admin/prices", { model: "mystery-model", input: 1.5, output: 3, searchPerK: -1 })).status,
    ).toBe(400);
    expect((await owner.call("/api/admin/prices", { model: "mystery-model", input: 1.5, output: 3 })).status).toBe(200);
    const before = (await owner.call("/api/admin/costs")).data.days[0].cost;
    expect(before).toBe(0);
    expect((await owner.call("/api/admin/costs/reprice", {})).status).toBe(200);
    expect((await owner.call("/api/admin/costs")).data.days[0].cost).toBeCloseTo(1.5);
    await owner.call("/api/admin/prices", { model: "mystery-model", remove: true });
    expect((await owner.call("/api/admin/prices")).data.unpriced).toEqual(["mystery-model"]);
  });

  it("is for owners only", async () => {
    const someone = await signIn("someone@example.com");
    expect((await someone.call("/api/admin/costs")).status).toBe(403);
    expect((await someone.call("/api/admin/prices")).status).toBe(403);
    expect((await someone.call("/api/admin/prices", { model: "x", input: 0, output: 0 })).status).toBe(403);
    expect((await someone.call("/api/admin/costs/reprice", {})).status).toBe(403);
  });
});
