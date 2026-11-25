"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/api/error-messages";

import { readCartPrices } from "../cart-prices";
import { checkoutKeys } from "../queries";
import { reserveLines } from "./start-checkout";

import type { ReservationItem } from "../api";

/**
 * Expired (or released) hold with "Giữ hàng lại": reserves the same lines again, seeds the cache
 * with the new reservation and replaces the URL. `CheckoutView` stays mounted, so the form keeps
 * what the shopper typed. Without the lines (the first read already answered 410) it goes back to
 * the cart.
 */
export function ReservationExpired({
  reservationId,
  items,
  released,
}: {
  reservationId: string;
  items: ReservationItem[] | undefined;
  released: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function reserveAgain() {
    if (!items || items.length === 0) {
      router.push("/cart");
      return;
    }
    setPending(true);
    setError(null);
    const cartPrices = readCartPrices(reservationId);
    try {
      const reservation = await reserveLines(
        items.map(({ sku, quantity }) => {
          const expectedUnitPrice = cartPrices[sku];
          return { sku, quantity, ...(expectedUnitPrice ? { expectedUnitPrice } : {}) };
        }),
      );
      queryClient.setQueryData(checkoutKeys.reservation(reservation.id), reservation);
      router.replace(`/checkout?reservation=${reservation.id}`);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="hold-expired-h"
      className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-6 text-center"
    >
      <h2 id="hold-expired-h" className="text-lg font-extrabold text-ink">
        {released ? "Phiên thanh toán đã được mở ở nơi khác" : "Hết thời gian giữ hàng"}
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-ink">
          {messageFor(error)}
        </p>
      ) : null}
      <Button onClick={reserveAgain} disabled={pending} className="h-touch">
        Giữ hàng lại
      </Button>
    </section>
  );
}
