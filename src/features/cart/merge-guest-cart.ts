import type { QueryClient } from "@tanstack/react-query";

import { postCartMerge } from "./api";
import { setCartCaches } from "./queries";

/** The merge may delay the post-login redirect by at most this long. */
export const MERGE_BUDGET_MS = 1000;

/** Merges the guest cart into the user cart and feeds the cart caches; rejects on failure or timeout. */
export async function mergeGuestCart(queryClient: QueryClient): Promise<void> {
  const cart = await postCartMerge(AbortSignal.timeout(MERGE_BUDGET_MS));
  setCartCaches(queryClient, cart);
}
