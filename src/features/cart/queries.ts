import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getCart, getCartSummary, type Cart } from "./api";
import { recordCartCount } from "./cart-count-hint";

/** Query key factory: every cart query key starts with cartKeys.all. */
export const cartKeys = {
  all: ["cart"] as const,
  summary: () => [...cartKeys.all, "summary"] as const,
  mine: () => [...cartKeys.all, "mine"] as const,
};

export const cartQueries = {
  summary: () =>
    queryOptions({
      queryKey: cartKeys.summary(),
      queryFn: async ({ signal }) => {
        const summary = await getCartSummary(signal);
        recordCartCount(summary.itemCount);
        return summary;
      },
      staleTime: 15_000,
    }),
  /** The full cart; persisted in IndexedDB so the page can paint from the last known cart. */
  mine: () =>
    queryOptions({
      queryKey: cartKeys.mine(),
      queryFn: async ({ signal }) => {
        const cart = await getCart(signal);
        recordCartCount(cart.itemCount);
        return cart;
      },
      staleTime: 0,
      retry: 1,
      meta: { persist: true },
    }),
};

/**
 * One cache: a cart from any write feeds both the full cart and the badge. It never writes the
 * `cart_count` hint, because optimistic carts and rollbacks pass through here too; callers record
 * the hint with `recordCartCount` only from a confirmed server response.
 */
export function setCartCaches(queryClient: QueryClient, cart: Cart): void {
  queryClient.setQueryData(cartKeys.mine(), cart);
  queryClient.setQueryData(cartKeys.summary(), { itemCount: cart.itemCount });
}
