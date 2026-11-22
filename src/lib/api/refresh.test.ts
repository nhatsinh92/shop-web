import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { server } from "../../../mocks/node";

import { ApiError } from "./api-error";
import { api, unwrap } from "./client";
import { onSessionExpired } from "./refresh";

const PRODUCTS = "*/api/products";
const REFRESH = "*/api/auth/refresh";
const ok = { items: [], nextCursor: null };
const unauthorized = () =>
  HttpResponse.json(
    { type: "about:blank", title: "T", status: 401, detail: "d", code: "AUTH_REQUIRED" },
    { status: 401, headers: { "content-type": "application/problem+json" } },
  );

/** Resolves a handler that returns 401 on the first call per `key` and 200 after. */
function firstCall401() {
  const seen = new Set<string>();
  return ({ request }: { request: Request }) => {
    const key = new URL(request.url).searchParams.get("category") ?? "";
    if (seen.has(key)) return HttpResponse.json(ok);
    seen.add(key);
    return unauthorized();
  };
}

const unsubscribers: Array<() => void> = [];
afterEach(() => {
  for (const off of unsubscribers.splice(0)) off();
});

describe("single-flight token refresh", () => {
  it("N parallel 401s → one refresh call", async () => {
    let refreshCalls = 0;
    let productCalls = 0;
    const first = firstCall401();
    server.use(
      http.get(PRODUCTS, (info) => {
        productCalls += 1;
        return first(info);
      }),
      http.post(REFRESH, async () => {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        api.GET("/api/products", { params: { query: { category: String(i) } } }).then(unwrap),
      ),
    );
    expect(refreshCalls).toBe(1);
    expect(productCalls).toBe(10);
    expect(results).toHaveLength(5);
    for (const r of results) expect(r).toEqual(ok);
  });

  it("retries at most once and does not refresh twice", async () => {
    let refreshCalls = 0;
    let productCalls = 0;
    server.use(
      http.get(PRODUCTS, () => {
        productCalls += 1;
        return unauthorized();
      }),
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.GET("/api/products").then(unwrap)).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
    expect(refreshCalls).toBe(1);
    expect(productCalls).toBe(2);
  });

  it.each([
    [
      "401 AUTH_REFRESH_INVALID",
      () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "T",
            status: 401,
            detail: "d",
            code: "AUTH_REFRESH_INVALID",
          },
          { status: 401, headers: { "content-type": "application/problem+json" } },
        ),
    ],
    ["503", () => new HttpResponse(null, { status: 503 })],
    ["network error", () => HttpResponse.error()],
  ])("a failed refresh (%s) rejects every waiter with 401 and signals once", async (_n, reply) => {
    const listener = vi.fn();
    unsubscribers.push(onSessionExpired(listener));
    let productCalls = 0;
    server.use(
      http.get(PRODUCTS, () => {
        productCalls += 1;
        return unauthorized();
      }),
      http.post(REFRESH, async () => {
        await new Promise((r) => setTimeout(r, 20));
        return reply();
      }),
    );
    const settled = await Promise.allSettled([
      api.GET("/api/products").then(unwrap),
      api.GET("/api/products").then(unwrap),
      api.GET("/api/products").then(unwrap),
    ]);
    for (const s of settled) {
      expect(s.status).toBe("rejected");
      const reason = (s as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(ApiError);
      expect(reason.status).toBe(401);
    }
    expect(productCalls).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("onSessionExpired returns an unsubscribe function", async () => {
    const listener = vi.fn();
    const off = onSessionExpired(listener);
    off();
    server.use(
      http.get(PRODUCTS, unauthorized),
      http.post(REFRESH, () => new HttpResponse(null, { status: 503 })),
    );
    await api.GET("/api/products").catch(() => undefined);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([
    ["refresh", () => api.POST("/api/auth/refresh"), "post", "*/api/auth/refresh"],
    [
      "login",
      () => api.POST("/api/auth/login", { body: { email: "a@b.vn", password: "secret-pass" } }),
      "post",
      "*/api/auth/login",
    ],
    ["logout", () => api.POST("/api/auth/logout"), "post", "*/api/auth/logout"],
  ] as const)("a 401 from %s never triggers a refresh", async (_n, call, _m, path) => {
    let refreshCalls = 0;
    server.use(
      http.post(path, unauthorized),
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(call().then(unwrap)).rejects.toMatchObject({ status: 401 });
    // the refresh endpoint's own 401 is the call itself, so count only extra calls
    expect(refreshCalls).toBe(0);
  });

  it("a retried POST sends the same method, headers and JSON body", async () => {
    const received: Array<{ method: string; type: string | null; body: unknown }> = [];
    let first = true;
    server.use(
      http.post("*/api/checkout/reservations", async ({ request }) => {
        received.push({
          method: request.method,
          type: request.headers.get("content-type"),
          body: await request.json(),
        });
        if (first) {
          first = false;
          return unauthorized();
        }
        return HttpResponse.json({}, { status: 200 });
      }),
      http.post(REFRESH, () => new HttpResponse(null, { status: 204 })),
    );
    await api.POST("/api/checkout/reservations", {
      body: { items: [{ sku: "SKU-1", quantity: 2 }] },
    });
    expect(received).toHaveLength(2);
    expect(received[1]).toEqual(received[0]);
    expect(received[0]?.body).toEqual({ items: [{ sku: "SKU-1", quantity: 2 }] });
  });

  it("starts a new refresh for a later 401 after the first settled", async () => {
    let refreshCalls = 0;
    for (let round = 0; round < 2; round += 1) {
      const first = firstCall401();
      server.use(
        http.get(PRODUCTS, first),
        http.post(REFRESH, () => {
          refreshCalls += 1;
          return new HttpResponse(null, { status: 204 });
        }),
      );
      await unwrap(
        await api.GET("/api/products", { params: { query: { category: `r${round}` } } }),
      );
    }
    expect(refreshCalls).toBe(2);
  });

  it("an aborted request does not refresh and rethrows AbortError", async () => {
    let refreshCalls = 0;
    server.use(
      http.get(PRODUCTS, async () => {
        await new Promise((r) => setTimeout(r, 50));
        return unauthorized();
      }),
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const controller = new AbortController();
    const pending = api.GET("/api/products", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(refreshCalls).toBe(0);
  });
});
