import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

// `"use cache"` is a no-op under Vitest, and so are cacheLife/cacheTag (they throw outside Next).
// Test files that mock `next/cache` themselves keep their own mock.
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  cacheLife: () => {},
  cacheTag: () => {},
}));

import { server } from "./mocks/node";

// Every request in a test must be handled by MSW; unhandled requests fail the test.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
