"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/api/error-messages";

import { readCartPrices } from "../cart-prices";
import { checkoutKeys } from "../queries";
import { reserveLines } from "./start-checkout";

import type { Order, ReservationItem } from "../api";

/**
 * `PAYMENT_FAILED` (artboard error state): "Thanh toán không thành công", or "Thanh toán quá thời
 * gian chờ" for `TIMED_OUT`. Both ways out reserve the same lines again (a new reservation, so a
 * new idempotency key) and go back to the form, which `CheckoutView` keeps mounted: "Thử lại" with
 * the same payment method, "Đổi sang COD" with `onSwitchToCod` selecting COD first.
 */
export function PaymentFailedPanel({
  order,
  reservationId,
  items,
  onSwitchToCod,
  onRetry,
}: {
  order: Order;
  reservationId: string;
  items: ReservationItem[];
  onSwitchToCod: () => void;
  /** Called once the new reservation is in place. */
  onRetry: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const timedOut = order.payment.status === "TIMED_OUT";

  async function again(cod: boolean) {
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
      if (cod) onSwitchToCod();
      onRetry();
      router.replace(`/checkout?reservation=${reservation.id}`);
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="pay-failed-h"
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-white p-4"
    >
      <h3 id="pay-failed-h" className="font-extrabold text-destructive">
        {timedOut ? "Thanh toán quá thời gian chờ" : "Thanh toán không thành công"}
      </h3>
      <p className="text-sm text-ink">Hãy thử lại hoặc chọn thanh toán khi nhận hàng.</p>
      {error ? (
        <p role="alert" className="text-sm text-ink">
          {messageFor(error)}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button onClick={() => again(false)} disabled={pending} className="h-touch">
          Thử lại
        </Button>
        <Button
          variant="outline"
          onClick={() => again(true)}
          disabled={pending}
          className="h-touch"
        >
          Đổi sang COD
        </Button>
      </div>
    </section>
  );
}
