import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 3021;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    viewport: { width: 390, height: 844 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Dedicated port + env so we never reuse a dev server on :3020 without DEV_SKIP_LINE_AUTH.
  webServer: {
    command: `pnpm exec next dev --hostname 0.0.0.0 --port ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_DEV_SKIP_LINE_AUTH: "true",
      IRON_SESSION_PASSWORD: "test-password-must-be-at-least-32-characters-long",
    },
  },
});
