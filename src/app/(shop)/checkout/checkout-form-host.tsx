"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { authQueries } from "@/features/auth";
import { cartKeys } from "@/features/cart/client";
import { CheckoutView } from "@/features/checkout/client";
import { api } from "@/lib/api";

/** Removes one ordered line from the cart; a failure is ignored (the order is placed anyway). */
async function removeOrderedLine(sku: string): Promise<void> {
  try {
    await api.DELETE("/api/cart/items/{sku}", { params: { path: { sku } } });
  } catch {
    // The cart refetch below shows what is left; the success state does not depend on it.
  }
}

/**
 * Composes the signed-in user's name and the cart clean-up with CheckoutView (features never
 * import each other): after an order, every ordered SKU is removed from the cart, then the cart
 * queries are invalidated.
 */
export function CheckoutFormHost({ reservationId }: { reservationId: string }) {
  const me = useQuery({ ...authQueries.me(), retry: false });
  const queryClient = useQueryClient();

  async function onOrderPlaced(skus: string[]) {
    await Promise.all(skus.map(removeOrderedLine));
    await queryClient.invalidateQueries({ queryKey: cartKeys.all });
  }

  return (
    <CheckoutView
      reservationId={reservationId}
      displayName={me.data?.displayName}
      onOrderPlaced={(skus) => void onOrderPlaced(skus)}
    />
  );
}
