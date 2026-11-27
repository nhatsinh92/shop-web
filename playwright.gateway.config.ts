import { defineConfig, devices } from "@playwright/test";

// Cart journeys against the real shop-api gateway (`make e2e-gateway`, with shop-api's `make demo`
// running). `make e2e-gateway` builds and starts shop-web itself, so there is no webServer here.
// One worker and no parallelism: the journeys share three seed users, whose carts they empty, and
// the gateway allows 5 logins per email per minute.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e-gateway",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "phone",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
