import { defineConfig, devices } from "@playwright/test";

// E2E suite — expects the app running on localhost:3000
// (sandbox: `bash .zscripts/dev.sh` serves the production build; locally:
//  `bun run build && bun run start`, or just `bun run dev`).
// Run: bun run test:e2e
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // sequential: shared SQLite catalog + clean state assumptions
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    locale: "en-US",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // reuse the already-running preview/production server when present
    command: "bash .zscripts/dev.sh",
    url: "http://localhost:3000/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
