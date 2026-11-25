import { authHandlers } from "./auth-handlers";
import { cartHandlers } from "./cart-handlers";
import { checkoutHandlers } from "./checkout-handlers";
import { cartSummaryFixture } from "./fixtures/cart";
import { cartHttp } from "./http";
import { productHandlers } from "./product-handlers";

/**
 * MSW handlers for tests and local mock mode. They use only the typed helpers from ./http, so
 * every handler is checked against @shop/api-contract. Each feature adds its own handlers.
 */
export const handlers = [
  cartHttp.get("/api/cart/summary", ({ response }) => response(200).json(cartSummaryFixture)),
  ...authHandlers,
  ...cartHandlers,
  ...checkoutHandlers,
  ...productHandlers,
];
