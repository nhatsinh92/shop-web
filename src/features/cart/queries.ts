import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { getCart, getCartSummary, type Cart } from "./api";

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
      queryFn: ({ signal }) => getCartSummary(signal),
      staleTime: 15_000,
    }),
  /** The full cart; persisted in IndexedDB so the page can paint from the last known cart. */
  mine: () =>
    queryOptions({
      queryKey: cartKeys.mine(),
      queryFn: ({ signal }) => getCart(signal),
      staleTime: 0,
      retry: 1,
      meta: { persist: true },
    }),
};

/** One cache: a cart response from any write feeds both the full cart and the badge. */
export function setCartCaches(queryClient: QueryClient, cart: Cart): void {
  queryClient.setQueryData(cartKeys.mine(), cart);
  queryClient.setQueryData(cartKeys.summary(), { itemCount: cart.itemCount });
}
