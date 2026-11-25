"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError } from "@/lib/api";
import { messageFor } from "@/lib/api/error-messages";

import { checkoutQueries } from "../queries";
import { AddressForm } from "./address-form";
import { CheckoutSectionSkeleton, CheckoutSkeleton } from "./checkout-skeleton";
import { CheckoutConsumed, CheckoutNotFound } from "./checkout-states";
import { HoldBanner } from "./hold-banner";
import { MockOutcomeSelect } from "./mock-outcome-select";
import { OrderSummary } from "./order-summary";
import { PaymentMethods } from "./payment-methods";
import { ReservationExpired } from "./reservation-expired";
import { ShippingOptions } from "./shipping-options";
import { useCheckoutForm } from "./use-checkout-form";

/**
 * Container of the checkout page (artboard Checkout, tag CLIENT): the form column and the summary
 * card. Each read hydrated by `CheckoutSection` renders at once; one that timed out or failed on
 * the server is fetched here (`retry: 1`) under its own skeleton. The address form, shipping and
 * payment state live in `useCheckoutForm`, so they survive a replaced reservation.
 */
export function CheckoutView({
  reservationId,
  displayName,
  shippingFee,
}: {
  reservationId: string;
  /** Name of the signed-in user; prefills "Họ và tên" when it is still empty. */
  displayName?: string;
  /** Fee of the selected shipping option; defaults to the first option, the one preselected. */
  shippingFee?: number;
}) {
  // The `expiresAt` whose countdown reached 0; a new reservation has a new `expiresAt`.
  const [lapsedAt, setLapsedAt] = useState<string | null>(null);
  const reservation = useQuery({
    ...checkoutQueries.reservation(reservationId),
    // A 404 or 410 is an answer, not a glitch: show it at once instead of retrying.
    retry: (count, error) =>
      count < 1 && !(error instanceof ApiError && (error.status === 404 || error.status === 410)),
  });
  const shipping = useQuery({ ...checkoutQueries.shippingOptions(reservationId), retry: 1 });
  const payment = useQuery({ ...checkoutQueries.paymentMethods(), retry: 1 });
  const checkoutForm = useCheckoutForm({
    displayName,
    shippingOptions: shipping.data?.items,
    paymentMethods: payment.data?.items,
  });

  if (reservation.error instanceof ApiError && reservation.error.status === 404) {
    return <CheckoutNotFound />;
  }
  if (reservation.data?.status === "CONSUMED") return <CheckoutConsumed />;
  const expiredByError =
    reservation.error instanceof ApiError &&
    reservation.error.status === 410 &&
    reservation.error.code === "CHECKOUT_RESERVATION_EXPIRED";
  if (!reservation.data && expiredByError) {
    return <ReservationExpired reservationId={reservationId} items={undefined} released={false} />;
  }
  if (!reservation.data) {
    if (reservation.isError) {
      return (
        <p role="alert" className="text-ink">
          {messageFor(reservation.error)}
        </p>
      );
    }
    return <CheckoutSkeleton />;
  }

  const { status, expiresAt, items } = reservation.data;
  const released = status === "RELEASED";
  const expired = released || status === "EXPIRED" || expiredByError || lapsedAt === expiresAt;
  const fee = shippingFee ?? checkoutForm.shippingFee ?? 0;

  // One root for every state, so the form column keeps its state across "Giữ hàng lại".
  return (
    <div className="flex flex-col gap-5">
      {expired ? (
        <ReservationExpired reservationId={reservationId} items={items} released={released} />
      ) : (
        <HoldBanner expiresAt={expiresAt} onExpire={() => setLapsedAt(expiresAt)} />
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section
            aria-labelledby="address-h"
            className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6"
          >
            <h2 id="address-h" className="text-lg font-extrabold text-ink">
              Địa chỉ giao hàng
            </h2>
            <AddressForm form={checkoutForm.form} />
          </section>
          <section
            aria-labelledby="ship-h"
            className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6"
          >
            <h2 id="ship-h" className="text-lg font-extrabold text-ink">
              Phương thức vận chuyển
            </h2>
            {shipping.data ? (
              <ShippingOptions
                options={shipping.data.items}
                value={checkoutForm.shippingOptionId}
                onChange={checkoutForm.selectShipping}
              />
            ) : (
              <CheckoutSectionSkeleton label="Đang tải phương thức vận chuyển" />
            )}
          </section>
          <section
            aria-labelledby="pay-h"
            className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6"
          >
            <h2 id="pay-h" className="text-lg font-extrabold text-ink">
              Phương thức thanh toán
            </h2>
            {payment.data ? (
              <PaymentMethods
                methods={payment.data.items}
                value={checkoutForm.paymentMethodId}
                onChange={checkoutForm.selectPayment}
              />
            ) : (
              <CheckoutSectionSkeleton label="Đang tải phương thức thanh toán" />
            )}
            <MockOutcomeSelect
              value={checkoutForm.outcomeChoice}
              onChange={checkoutForm.selectOutcome}
            />
          </section>
        </div>
        <aside aria-label="Đơn hàng" className="flex flex-col gap-4 lg:w-[360px]">
          <OrderSummary reservation={reservation.data} shippingFee={fee} />
        </aside>
      </div>
    </div>
  );
}
