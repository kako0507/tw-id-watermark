import { defineConfig, devices } from "@playwright/test";

const PORT = 5180;

export default defineConfig({
  testDir: "e2e",
  // The first detection downloads OpenCV.js (~10MB) from a CDN
  timeout: 180_000,
  expect: { timeout: 30_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${PORT}`,
    // Use an installed browser instead of downloading one, e.g. PW_CHANNEL=msedge or chrome
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1400, height: 1000 },
  },
  webServer: {
    // Dev server: the store is exposed as window.__store in development only
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
