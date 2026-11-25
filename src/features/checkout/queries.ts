import { queryOptions } from "@tanstack/react-query";

import { getCheckoutReservation, getOrder, listPaymentMethods, listShippingOptions } from "./api";

/** Query key factory for checkout data (user data: never persisted, never cached by Next.js). */
export const checkoutKeys = {
  all: ["checkout"] as const,
  reservation: (id: string) => [...checkoutKeys.all, "reservation", id] as const,
  shippingOptions: (reservationId: string) =>
    [...checkoutKeys.all, "shipping-options", reservationId] as const,
  paymentMethods: () => [...checkoutKeys.all, "payment-methods"] as const,
};

export const orderKeys = {
  all: ["order"] as const,
  detail: (id: string) => [...orderKeys.all, "detail", id] as const,
};

export const checkoutQueries = {
  reservation: (id: string) =>
    queryOptions({
      queryKey: checkoutKeys.reservation(id),
      queryFn: ({ signal }) => getCheckoutReservation(id, signal),
      staleTime: 0,
    }),
  shippingOptions: (reservationId: string) =>
    queryOptions({
      queryKey: checkoutKeys.shippingOptions(reservationId),
      queryFn: ({ signal }) => listShippingOptions(reservationId, signal),
      staleTime: 0,
    }),
  paymentMethods: () =>
    queryOptions({
      queryKey: checkoutKeys.paymentMethods(),
      queryFn: ({ signal }) => listPaymentMethods(signal),
      staleTime: 0,
    }),
};

export const orderQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: orderKeys.detail(id),
      queryFn: ({ signal }) => getOrder(id, signal),
      staleTime: 0,
    }),
};
