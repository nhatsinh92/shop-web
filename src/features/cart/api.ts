import { api, unwrap } from "@/lib/api";

import type { CartComponents } from "@/lib/api";

export type Cart = CartComponents["schemas"]["Cart"];
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

/** Browser call: the full cart of the current session (signed in or guest). */
export async function getCart(signal?: AbortSignal): Promise<Cart> {
  return unwrap(await api.GET("/api/cart", { signal }));
}

/** Browser call: sets the absolute quantity of a line; throws ApiError on a problem response. */
export async function updateCartItem(sku: string, quantity: number): Promise<Cart> {
  return unwrap(
    await api.PATCH("/api/cart/items/{sku}", {
      params: { path: { sku } },
      body: { quantity },
    }),
  );
}

/** Browser call: removes a line; throws ApiError on a problem response. */
export async function removeCartItem(sku: string): Promise<Cart> {
  return unwrap(await api.DELETE("/api/cart/items/{sku}", { params: { path: { sku } } }));
}

/** Browser call: merges the guest cart into the signed-in cart and returns the result. */
export async function postCartMerge(signal?: AbortSignal): Promise<Cart> {
  return unwrap(await api.POST("/api/cart/merge", { signal }));
}
