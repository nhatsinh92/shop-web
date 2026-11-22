import { http, HttpResponse } from "msw";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { server } from "../../../mocks/node";

import { ApiError } from "./api-error";
import { api, unwrap } from "./client";
import type { paths as CartPaths } from "./generated/cart";
import type { paths as CorePaths } from "./generated/core";

const PRODUCTS = "*/api/products";
const problem = (status: number, code: string, extra: object = {}) =>
  HttpResponse.json(
    {
      type: "about:blank",
      title: `T${status}`,
      status,
      detail: `detail ${status}`,
      code,
      ...extra,
    },
    { status, headers: { "content-type": "application/problem+json" } },
  );

async function failure(): Promise<unknown> {
  try {
    await unwrap(await api.GET("/api/products"));
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

describe("api client types", () => {
  it("accepts only contract paths", () => {
    expectTypeOf<"/api/products">().toExtend<keyof (CorePaths & CartPaths)>();
    expectTypeOf<"/api/not-in-contract">().not.toExtend<keyof (CorePaths & CartPaths)>();
  });
});

describe("api client requests", () => {
  it("sends credentials include and accept application/json", async () => {
    let received: Request | undefined;
    server.use(http.get(PRODUCTS, () => HttpResponse.json({ items: [], nextCursor: null })));
    const realFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      received = input as Request;
      return realFetch(input, init);
    });
    try {
      await api.GET("/api/products");
    } finally {
      spy.mockRestore();
    }
    expect(received?.credentials).toBe("include");
    expect(received?.headers.get("accept")).toBe("application/json");
  });

  it("unwrap returns data for 2xx", async () => {
    server.use(http.get(PRODUCTS, () => HttpResponse.json({ items: [], nextCursor: null })));
    const data = await unwrap(await api.GET("/api/products"));
    expect(data).toEqual({ items: [], nextCursor: null });
  });
});

describe("problem+json mapping", () => {
  it.each([
    [400, "VALIDATION_FAILED"],
    [401, "AUTH_UNAUTHENTICATED"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
    [503, "UNAVAILABLE"],
  ])("maps %i to ApiError with code and detail", async (status, code) => {
    const errors = status === 400 ? [{ field: "limit", code: "MAX" }] : undefined;
    server.use(http.get(PRODUCTS, () => problem(status, code, errors ? { errors } : {})));
    const error = await failure();
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code, detail: `detail ${status}` });
    expect((error as ApiError).errors).toEqual(errors);
  });
});

describe("non-problem error bodies", () => {
  it.each([
    [
      "HTML",
      () =>
        new HttpResponse("<html></html>", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "text/html" },
        }),
    ],
    ["an empty body", () => new HttpResponse(null, { status: 502, statusText: "Bad Gateway" })],
    [
      "invalid JSON",
      () =>
        new HttpResponse("{oops", {
          status: 502,
          statusText: "Bad Gateway",
          headers: { "content-type": "application/problem+json" },
        }),
    ],
  ])("maps %s to UNKNOWN_ERROR", async (_name, respond) => {
    server.use(http.get(PRODUCTS, respond));
    expect(await failure()).toMatchObject({
      status: 502,
      code: "UNKNOWN_ERROR",
      detail: "Bad Gateway",
    });
  });
});

describe("transport failures", () => {
  it("maps a network failure to NETWORK_ERROR with status 0", async () => {
    server.use(http.get(PRODUCTS, () => HttpResponse.error()));
    expect(await failure()).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("rethrows an aborted request as AbortError", async () => {
    server.use(http.get(PRODUCTS, async () => new Promise(() => {})));
    const controller = new AbortController();
    const pending = api.GET("/api/products", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("ApiError", () => {
  it("is an Error and an ApiError named ApiError", () => {
    const error = new ApiError({ status: 500, code: "X", detail: "d" });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.name).toBe("ApiError");
  });
});
