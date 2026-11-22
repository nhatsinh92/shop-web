import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
// Stub gateway for the auth journeys; the app talks to it for /api/* and the proxy refresh.
const stubPort = Number(process.env.E2E_STUB_PORT ?? 4010);
const stubUrl = `http://localhost:${stubPort}`;

// End-to-end tests run against a production build (`next start`), so prerendering, streaming
// and caching behave as in production. Screenshots are taken at desktop and phone width.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: "node e2e/support/stub-gateway.ts",
          url: `${stubUrl}/__stub/health`,
          reuseExistingServer: !process.env.CI,
          env: { E2E_STUB_PORT: String(stubPort) },
          timeout: 30_000,
        },
        {
          command: `pnpm exec next start -p ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          env: { GATEWAY_URL: stubUrl, CORE_INTERNAL_URL: stubUrl, CART_INTERNAL_URL: stubUrl },
          timeout: 60_000,
        },
      ],
});
