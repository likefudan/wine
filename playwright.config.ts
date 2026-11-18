import { defineConfig } from "@playwright/test";

/** Browser tests of the main flows on a local Worker with a fresh database (scripts/e2e-server.sh). */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:8788",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: "sh scripts/e2e-server.sh",
    url: "http://localhost:8788/api/health",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
