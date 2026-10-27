import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL, trace: "retain-on-failure" },
  // WebKit = the Safari engine; "iPhone 15" emulates viewport, touch and the Safari user agent.
  projects: [
    { name: "iphone-safari", use: { ...devices["iPhone 15"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run start", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
