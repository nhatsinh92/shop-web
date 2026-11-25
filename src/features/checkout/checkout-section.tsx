import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { CheckoutConsumed, CheckoutNotFound } from "./components/checkout-states";
import { getCheckoutForRequest } from "./checkout.server";
import { checkoutKeys } from "./queries";

/**
 * STREAM hole of the checkout page. Fetches the reservation, shipping options and payment methods
 * (reads cookies, so it must sit inside a `<Suspense>`) and hydrates what arrived within the 300 ms
 * budget; a read that timed out or failed is left to the client. A 404 and a consumed reservation
 * render their state here. A 401 hydrates nothing: the client's single-flight refresh handles it.
 */
export async function CheckoutSection({
  reservationId,
  children,
}: {
  reservationId: string;
  children?: ReactNode;
}) {
  const { reservation, shippingOptions, paymentMethods } =
    await getCheckoutForRequest(reservationId);

  if (reservation.status === "notFound") return <CheckoutNotFound />;
  if (reservation.ok && reservation.data.status === "CONSUMED") return <CheckoutConsumed />;

  const queryClient = new QueryClient();
  if (reservation.ok) {
    queryClient.setQueryData(checkoutKeys.reservation(reservationId), reservation.data);
  }
  if (shippingOptions.ok) {
    queryClient.setQueryData(checkoutKeys.shippingOptions(reservationId), shippingOptions.data);
  }
  if (paymentMethods.ok) {
    queryClient.setQueryData(checkoutKeys.paymentMethods(), paymentMethods.data);
  }

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
