import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          DEV_LOGIN: "1",
          ENVIRONMENT: "test",
          OWNER_EMAILS: "owner@example.com",
        },
      },
    })),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    testTimeout: 15_000,
    deps: { optimizer: { ssr: { enabled: true, include: ["@anthropic-ai/sdk"] } } },
  },
});
