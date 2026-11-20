import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

import { server } from "./mocks/node";

// Every request in a test must be handled by MSW; unhandled requests fail the test.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
