"use client";

import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";
import { messageFor } from "@/lib/api/error-messages";

import { checkoutQueries } from "../queries";
import { CheckoutSectionSkeleton, CheckoutSkeleton } from "./checkout-skeleton";
import { CheckoutConsumed, CheckoutNotFound } from "./checkout-states";

/**
 * Container of the checkout page (artboard Checkout, tag CLIENT): the form column and the summary
 * card. Each read hydrated by `CheckoutSection` renders at once; one that timed out or failed on
 * the server is fetched here (`retry: 1`) under its own skeleton. Later tasks fill the sections.
 */
export function CheckoutView({ reservationId }: { reservationId: string }) {
  const reservation = useQuery({ ...checkoutQueries.reservation(reservationId), retry: 1 });
  const shipping = useQuery({ ...checkoutQueries.shippingOptions(reservationId), retry: 1 });
  const payment = useQuery({ ...checkoutQueries.paymentMethods(), retry: 1 });

  if (reservation.error instanceof ApiError && reservation.error.status === 404) {
    return <CheckoutNotFound />;
  }
  if (reservation.data?.status === "CONSUMED") return <CheckoutConsumed />;
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

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <section
          aria-labelledby="ship-h"
          className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-6"
        >
          <h2 id="ship-h" className="text-lg font-extrabold text-ink">
            Phương thức vận chuyển
          </h2>
          {shipping.data ? (
            <ul className="flex flex-col gap-2">
              {shipping.data.items.map((option) => (
                <li key={option.id}>{option.name}</li>
              ))}
            </ul>
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
            <ul className="flex flex-col gap-2">
              {payment.data.items.map((method) => (
                <li key={method.id}>{method.name}</li>
              ))}
            </ul>
          ) : (
            <CheckoutSectionSkeleton label="Đang tải phương thức thanh toán" />
          )}
        </section>
      </div>
      <aside aria-label="Đơn hàng" className="flex flex-col gap-4 lg:w-[360px]">
        <div className="flex flex-col gap-3.5 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-lg font-extrabold text-ink">
            Đơn hàng ({reservation.data.items.length} sản phẩm)
          </h2>
        </div>
      </aside>
    </div>
  );
}
