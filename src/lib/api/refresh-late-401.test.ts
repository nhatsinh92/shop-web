import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "../../../mocks/node";

import { api, unwrap } from "./client";

const unauthorized = () =>
  HttpResponse.json(
    {
      type: "about:blank",
      title: "Unauthorized",
      status: 401,
      detail: "expired",
      code: "AUTH_UNAUTHENTICATED",
    },
    { status: 401, headers: { "content-type": "application/problem+json" } },
  );

const summary = { itemCount: 1 };
const cart = { items: [], itemCount: 0, subtotal: { amount: 0, currency: "VND" }, updatedAt: "" };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The browser's cookie jar, reduced to one flag: requests "carry" the session that was current
 * when they reached the server, and only a finished refresh makes it fresh.
 */
function sessionServer(options: { lateRequestWaitsFor: Promise<void> }) {
  const state = { fresh: false, refreshCalls: 0, refreshDone: deferred() };
  server.use(
    http.post("*/api/auth/refresh", async () => {
      state.refreshCalls += 1;
      await tick(20);
      state.fresh = true;
      state.refreshDone.resolve();
      return new HttpResponse(null, { status: 204 });
    }),
    http.get("*/api/cart/summary", () =>
      state.fresh ? HttpResponse.json(summary) : unauthorized(),
    ),
    http.post("*/api/cart/items", async () => {
      const sentFresh = state.fresh;
      // Its 401 comes back only after the refresh has settled (the in-flight promise is cleared).
      await options.lateRequestWaitsFor;
      await tick(20);
      return sentFresh ? HttpResponse.json(cart) : unauthorized();
    }),
  );
  return state;
}

describe("a 401 that arrives after a refresh finished (issue 159)", () => {
  it("a request sent before the refresh finished is retried without a second refresh", async () => {
    const gate = deferred();
    const state = sessionServer({ lateRequestWaitsFor: gate.promise });
    void state.refreshDone.promise.then(gate.resolve);

    const first = api.GET("/api/cart/summary");
    const late = api.POST("/api/cart/items", { body: { sku: "SKU-1", quantity: 1 } });

    expect(await unwrap(await first)).toEqual(summary);
    expect(await unwrap(await late)).toEqual(cart);
    expect(state.refreshCalls).toBe(1);
  });

  it("a request sent after the refresh finished still refreshes on its own 401", async () => {
    const state = sessionServer({ lateRequestWaitsFor: Promise.resolve() });
    expect(await unwrap(await api.GET("/api/cart/summary"))).toEqual(summary);
    expect(state.refreshCalls).toBe(1);

    // The new session expires too: a fresh 401 for a request sent now needs a new refresh.
    state.fresh = false;
    expect(await unwrap(await api.GET("/api/cart/summary"))).toEqual(summary);
    expect(state.refreshCalls).toBe(2);
  });
});
