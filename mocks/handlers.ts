import { cartSummaryFixture } from "./fixtures/cart";
import { cartHttp } from "./http";

/**
 * MSW handlers for tests and local mock mode. They use only the typed helpers from ./http, so
 * every handler is checked against @shop/api-contract. Each feature adds its own handlers.
 */
export const handlers = [
  cartHttp.get("/api/cart/summary", ({ response }) => response(200).json(cartSummaryFixture)),
];
