"use client";

import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { cartQueries } from "./queries";
import {
  hydrateCartSelection,
  isLineSelected,
  useCartSelectionStore,
} from "./stores/cart-selection-store";

import type { Cart } from "./api";

function subscribeHydration(onChange: () => void): () => void {
  return useCartSelectionStore.persist.onFinishHydration(onChange);
}

export interface CheckoutLine {
  sku: string;
  /** Product name; the reservation's `unavailable` entries carry only `sku`. */
  name: string;
  quantity: number;
  unitPrice: Cart["items"][number]["unitPrice"];
}

/**
 * The cart lines checkout starts from: selected and available, in cart order, the same rule the
 * cart summary panel uses. `isPending` stays true until the cart has data and the saved selection
 * is loaded, and `lines` is empty only when it is genuinely empty.
 */
export function useSelectedCheckoutLines(): { lines: CheckoutLine[]; isPending: boolean } {
  const { data } = useQuery(cartQueries.mine());
  const isRestoring = useIsRestoring();
  const selection = useCartSelectionStore((state) => state);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => useCartSelectionStore.persist.hasHydrated(),
    () => false,
  );

  // Load the saved selection after mount so the first client render matches the server HTML.
  useEffect(() => {
    hydrateCartSelection();
  }, []);

  const isPending = data === undefined || isRestoring || !hydrated;

  const lines = useMemo<CheckoutLine[]>(() => {
    if (isPending) return [];
    return data.items
      .filter((line) => line.available && isLineSelected(selection, line.sku))
      .map(({ sku, name, quantity, unitPrice }) => ({ sku, name, quantity, unitPrice }));
  }, [data, isPending, selection]);

  return { lines, isPending };
}
