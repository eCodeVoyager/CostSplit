import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT ?? 8799)

/**
 * End-to-end: real browsers against the production build and the real sync
 * server (e2e/server.mjs). Run with `npm run e2e`. Uses the installed Chrome;
 * set PW_CHANNEL= (empty) to use Playwright's own Chromium instead.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.PW_CHANNEL ?? "chrome",
    // Each test starts from a clean phone; no cached app shell between runs
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node e2e/server.mjs",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
