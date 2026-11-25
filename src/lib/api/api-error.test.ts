import { describe, expect, it } from "vitest";

import { checkoutOverrides } from "../../../mocks/checkout-handlers";
import { server } from "../../../mocks/node";

import { ApiError, apiErrorFromResponse } from "./api-error";
import { api, unwrap } from "./client";

function problemResponse(extra: object): Response {
  return new Response(
    JSON.stringify({ type: "about:blank", title: "Conflict", status: 409, code: "X", ...extra }),
    { status: 409, headers: { "content-type": "application/problem+json" } },
  );
}

describe("apiErrorFromResponse unavailable", () => {
  it("keeps entries with a string sku and numeric requested and available, drops the rest", async () => {
    const error = await apiErrorFromResponse(
      problemResponse({
        unavailable: [
          { sku: "A", requested: 2, available: 1 },
          { sku: 5, requested: 2, available: 1 },
          { sku: "B", requested: "2", available: 1 },
          { sku: "C", requested: 2 },
          null,
          { sku: "D", requested: 3, available: 0 },
        ],
      }),
    );
    expect(error.unavailable).toEqual([
      { sku: "A", requested: 2, available: 1 },
      { sku: "D", requested: 3, available: 0 },
    ]);
  });

  it("leaves the property absent without an unavailable list", async () => {
    const error = await apiErrorFromResponse(problemResponse({}));
    expect(error.code).toBe("X");
    expect("unavailable" in error).toBe(false);
  });

  it("leaves the property absent when unavailable is not an array", async () => {
    const error = await apiErrorFromResponse(problemResponse({ unavailable: "none" }));
    expect("unavailable" in error).toBe(false);
  });

  it("keeps the existing fields and UNKNOWN_ERROR for non-problem bodies", async () => {
    const error = await apiErrorFromResponse(
      new Response("oops", { status: 500, statusText: "Server Error" }),
    );
    expect(error.code).toBe("UNKNOWN_ERROR");
    expect("unavailable" in error).toBe(false);
  });

  it("exposes the list of a CHECKOUT_OUT_OF_STOCK response from the checkout handler", async () => {
    server.use(checkoutOverrides.reservationOutOfStock);
    const items = [
      { sku: "SKU-ANC-PRO-BLK", quantity: 3 },
      { sku: "SKU-AIRFRY-6L", quantity: 1 },
    ];
    const failure = await (async () =>
      unwrap(await api.POST("/api/checkout/reservations", { body: { items } })))().catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("CHECKOUT_OUT_OF_STOCK");
    expect((failure as ApiError).unavailable).toEqual([
      { sku: "SKU-ANC-PRO-BLK", requested: 3, available: 2 },
      { sku: "SKU-AIRFRY-6L", requested: 1, available: 0 },
    ]);
  });
});
