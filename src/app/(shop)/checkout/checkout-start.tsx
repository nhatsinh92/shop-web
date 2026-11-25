"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { cartKeys, useSelectedCheckoutLines } from "@/features/cart/client";
import { StartCheckout } from "@/features/checkout/client";

/** Composes the cart's selected lines with StartCheckout (features never import each other). */
export function CheckoutStart() {
  const queryClient = useQueryClient();
  const { lines, isPending } = useSelectedCheckoutLines();
  const refreshCart = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: cartKeys.all });
  }, [queryClient]);
  return <StartCheckout lines={lines} isPending={isPending} onOutOfStock={refreshCart} />;
}
