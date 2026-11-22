import type { Client } from "openapi-fetch";
import { http, HttpResponse, delay } from "msw";

import { server } from "../../../mocks/node";

import { ApiError } from "./api-error";
import type { paths as CartPaths } from "./generated/cart";
import type { paths as CorePaths } from "./generated/core";
import { ApiTimeoutError, serverApi } from "./server";

const CORE = "http://localhost:8081";
const CART = "http://localhost:8082";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function captureRequest(call: () => Promise<unknown>): Promise<Request> {
  let received: Request | undefined;
  const realFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    received = input as Request;
    return realFetch(input, init);
  });
  try {
    await call();
  } finally {
    spy.mockRestore();
  }
  if (!received) throw new Error("no request captured");
  return received;
}

describe("serverApi types", () => {
  it("types each client with its own service paths", () => {
    expectTypeOf(serverApi("core", { budgetMs: 1 })).toEqualTypeOf<
      ReturnType<typeof serverApi<"core">>
    >();
    expectTypeOf<"/api/products">().toExtend<keyof CorePaths>();
    expectTypeOf<"/api/products">().not.toExtend<keyof CartPaths>();
  });

  it("requires budgetMs and rejects paths outside the service", () => {
    expectTypeOf<Parameters<typeof serverApi>[1]>().toHaveProperty("budgetMs").toBeNumber();
    expectTypeOf<{ headers: HeadersInit }>().not.toExtend<Parameters<typeof serverApi>[1]>();
    expectTypeOf(serverApi("core", { budgetMs: 1 })).toEqualTypeOf<Client<CorePaths>>();
    expectTypeOf(serverApi("cart", { budgetMs: 1 })).toEqualTypeOf<Client<CartPaths>>();
    expectTypeOf(serverApi("cart", { budgetMs: 1 })).not.toEqualTypeOf<Client<CorePaths>>();
  });
});

describe("serverApi base URL", () => {
  it("uses CORE_INTERNAL_URL and CART_INTERNAL_URL when set", async () => {
    vi.stubEnv("CORE_INTERNAL_URL", "http://core.internal:9000");
    vi.stubEnv("CART_INTERNAL_URL", "http://cart.internal:9001");
    server.use(
      http.get("http://core.internal:9000/actuator/health", () =>
        HttpResponse.json({ status: "UP" }),
      ),
      http.get("http://cart.internal:9001/actuator/health", () =>
        HttpResponse.json({ status: "UP" }),
      ),
    );
    const core = await captureRequest(() =>
      serverApi("core", { budgetMs: 1000 }).GET("/actuator/health"),
    );
    const cart = await captureRequest(() =>
      serverApi("cart", { budgetMs: 1000 }).GET("/actuator/health"),
    );
    expect(core.url).toBe("http://core.internal:9000/actuator/health");
    expect(cart.url).toBe("http://cart.internal:9001/actuator/health");
  });

  it("defaults to localhost:8081 and localhost:8082 when unset", async () => {
    vi.stubEnv("CORE_INTERNAL_URL", "");
    vi.stubEnv("CART_INTERNAL_URL", "");
    server.use(
      http.get(`${CORE}/actuator/health`, () => HttpResponse.json({ status: "UP" })),
      http.get(`${CART}/actuator/health`, () => HttpResponse.json({ status: "UP" })),
    );
    const core = await captureRequest(() =>
      serverApi("core", { budgetMs: 1000 }).GET("/actuator/health"),
    );
    const cart = await captureRequest(() =>
      serverApi("cart", { budgetMs: 1000 }).GET("/actuator/health"),
    );
    expect(core.url).toBe(`${CORE}/actuator/health`);
    expect(cart.url).toBe(`${CART}/actuator/health`);
  });
});

describe("serverApi requests", () => {
  beforeEach(() => {
    vi.stubEnv("CORE_INTERNAL_URL", "");
    server.use(http.get(`${CORE}/actuator/health`, () => HttpResponse.json({ status: "UP" })));
  });

  it("sends cache no-store, a timeout signal and the forwarded cookie header", async () => {
    const request = await captureRequest(() =>
      serverApi("core", { budgetMs: 1000, headers: { cookie: "session=abc" } }).GET(
        "/actuator/health",
      ),
    );
    expect(request.cache).toBe("no-store");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.headers.get("cookie")).toBe("session=abc");
    expect(request.headers.get("accept")).toBe("application/json");
  });

  it("combines the caller signal with the budget", async () => {
    const controller = new AbortController();
    server.use(
      http.get(`${CORE}/actuator/health`, async () => {
        await delay(200);
        return HttpResponse.json({ status: "UP" });
      }),
    );
    const call = serverApi("core", { budgetMs: 5000 }).GET("/actuator/health", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(call).rejects.toMatchObject({ name: "AbortError" });
  });

  it("throws RangeError for a budget of zero or less", () => {
    expect(() => serverApi("core", { budgetMs: 0 })).toThrow(RangeError);
    expect(() => serverApi("cart", { budgetMs: -5 })).toThrow(RangeError);
  });
});

describe("serverApi errors", () => {
  it("rejects with ApiTimeoutError carrying service, path and budget", async () => {
    vi.stubEnv("CART_INTERNAL_URL", "");
    server.use(
      http.get(`${CART}/actuator/health`, async () => {
        await delay(500);
        return HttpResponse.json({ status: "UP" });
      }),
    );
    const error = await serverApi("cart", { budgetMs: 50 })
      .GET("/actuator/health")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ service: "cart", path: "/actuator/health", budgetMs: 50 });
  });

  it("maps a Problem response to ApiError", async () => {
    vi.stubEnv("CORE_INTERNAL_URL", "");
    server.use(
      http.get(`${CORE}/actuator/health`, () =>
        HttpResponse.json(
          { type: "about:blank", title: "T", status: 503, detail: "down", code: "UNAVAILABLE" },
          { status: 503, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const error = await serverApi("core", { budgetMs: 1000 })
      .GET("/actuator/health")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: "UNAVAILABLE", detail: "down" });
  });
});
