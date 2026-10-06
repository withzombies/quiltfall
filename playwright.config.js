import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3001",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
    {
      name: "desktop-webkit",
      testMatch: "invite.spec.js",
      use: { ...devices["Desktop Safari"], browserName: "webkit" },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command:
          "mkdir -p target/browser-data && BIND_ADDR=127.0.0.1:3001 DATABASE_URL=sqlite://target/browser-data/quiltfall.db cargo run",
        url: "http://127.0.0.1:3001/health",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
