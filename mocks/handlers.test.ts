import { describe, expect, expectTypeOf, it } from "vitest";

import type { components, paths as CartPaths } from "../src/lib/api/generated/cart";

import { cartSummaryFixture } from "./fixtures/cart";
import { cartHttp } from "./http";

describe("typed MSW helpers", () => {
  it("types the cart summary fixture with the generated response type", () => {
    expectTypeOf(cartSummaryFixture).toEqualTypeOf<components["schemas"]["CartSummary"]>();
    expect(cartSummaryFixture).toEqual({ itemCount: 3 });
  });

  it("compiles only when the handler response matches the contract", () => {
    // Returning { itemCount: 1 } here fails tsc; see the PR description.
    const handler = cartHttp.get("/api/cart/summary", ({ response }) =>
      response(200).json({ itemCount: 1 }),
    );
    expect(handler.info.path).toBe("*/api/cart/summary");
  });

  it("accepts only contract paths", () => {
    expectTypeOf<"/api/cart/summary">().toExtend<keyof CartPaths>();
    expectTypeOf<"/api/not-in-contract">().not.toExtend<keyof CartPaths>();
  });
});
