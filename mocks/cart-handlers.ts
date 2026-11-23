import { delay } from "msw";

import { cartHttp } from "./http";

import type { components } from "../src/lib/api/generated/cart";

type Cart = components["schemas"]["Cart"];
type Problem = components["schemas"]["Problem"];

const problemHeaders = () => new Headers({ "Content-Type": "application/problem+json" });

function problem(status: number, code: string, title: string): Problem {
  return { type: "about:blank", title, status, code };
}

/** The cart after an add: one line is enough for tests; the badge reads only `itemCount`. */
function cartAfterAdd(quantity: number): Cart {
  return {
    items: [],
    itemCount: 3 + quantity,
    subtotal: { amount: 0, currency: "VND" },
    updatedAt: new Date(0).toISOString(),
  };
}

export const cartHandlers = [
  cartHttp.post("/api/cart/items", async ({ request, response }) => {
    const body = (await request.json()) as { sku: string; quantity: number };
    return response(200).json(cartAfterAdd(body.quantity));
  }),
];

/** Per-scenario overrides for `server.use(...)` in tests and the dev mock. */
export const cartOverrides = {
  /** Add answers after `ms` milliseconds (optimistic update tests). */
  delayedAdd: (ms: number) =>
    cartHttp.post("/api/cart/items", async ({ response }) => {
      await delay(ms);
      return response(200).json(cartAfterAdd(0));
    }),
  /** 409 `CART_OUT_OF_STOCK`. */
  addOutOfStock: cartHttp.post("/api/cart/items", ({ response }) =>
    response(409).json(problem(409, "CART_OUT_OF_STOCK", "Out of stock"), {
      headers: problemHeaders(),
    }),
  ),
  /** 422 `CART_QTY_LIMIT`. */
  addQtyLimit: cartHttp.post("/api/cart/items", ({ response }) =>
    response(422).json(problem(422, "CART_QTY_LIMIT", "Quantity limit"), {
      headers: problemHeaders(),
    }),
  ),
  /** 503 `SERVICE_UNAVAILABLE`. */
  addUnavailable: cartHttp.post("/api/cart/items", ({ response }) =>
    response(503).json(problem(503, "SERVICE_UNAVAILABLE", "Unavailable"), {
      headers: problemHeaders(),
    }),
  ),
};
