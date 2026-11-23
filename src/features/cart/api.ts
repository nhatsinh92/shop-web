import { api, unwrap } from "@/lib/api";

import type { CartComponents } from "@/lib/api";

export type CartSummary = CartComponents["schemas"]["CartSummary"];

/** Browser call: goes to the gateway through /api/*, never through a Next.js route handler. */
export async function getCartSummary(signal?: AbortSignal): Promise<CartSummary> {
  return unwrap(await api.GET("/api/cart/summary", { signal }));
}

export type AddCartItemInput = CartComponents["schemas"]["AddCartItemRequest"];

/** Browser call: adds `quantity` units of `sku`; throws ApiError on a problem response. */
export async function addCartItem(input: AddCartItemInput): Promise<void> {
  unwrap(await api.POST("/api/cart/items", { body: input }));
}
