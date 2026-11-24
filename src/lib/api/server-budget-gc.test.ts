// Regression tests: the time budget and the caller's abort must still reach a pending request after
// a garbage collection. Before the fix, `new Request(..., { signal })` followed the combined signal
// only through a weak reference, so a GC during the request made the budget never elapse (the
// flaky "renders nothing and logs once on a timeout" test in CI).
import v8 from "node:v8";
import vm from "node:vm";

import { http, delay } from "msw";

import { server } from "../../../mocks/node";

import { ApiTimeoutError, serverApi } from "./server";

const CORE = "http://localhost:8081";

v8.setFlagsFromString("--expose-gc");
const gc = vm.runInNewContext("gc") as () => void;

/** Runs `call` while forcing a full garbage collection every 10 ms. */
async function underGcPressure<T>(call: () => Promise<T>): Promise<T> {
  const interval = setInterval(gc, 10);
  try {
    return await call();
  } finally {
    clearInterval(interval);
  }
}

beforeEach(() => {
  server.use(
    http.get(`${CORE}/actuator/health`, async () => {
      await delay("infinite");
    }),
  );
});

describe("serverApi budget under garbage collection", () => {
  it("rejects with ApiTimeoutError when the budget elapses after a GC", async () => {
    const started = Date.now();
    const error = await underGcPressure(() =>
      serverApi("core", { budgetMs: 100 })
        .GET("/actuator/health")
        .catch((e: unknown) => e),
    );
    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error).toMatchObject({ service: "core", path: "/actuator/health", budgetMs: 100 });
    expect(Date.now() - started).toBeLessThan(1000);
  }, 3000);

  it("rejects with AbortError when the caller aborts after a GC", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const error = await underGcPressure(() =>
      serverApi("core", { budgetMs: 5000 })
        .GET("/actuator/health", { signal: controller.signal })
        .catch((e: unknown) => e),
    );
    expect(error).toMatchObject({ name: "AbortError" });
  }, 3000);
});
