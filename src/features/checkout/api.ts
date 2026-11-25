import { api, unwrap } from "@/lib/api";

import type { CoreComponents } from "@/lib/api";

type Schemas = CoreComponents["schemas"];

export type Reservation = Schemas["Reservation"];
export type ReservationItem = Schemas["ReservationItem"];
export type CreateReservationInput = Schemas["CreateReservationRequest"];
export type ShippingOption = Schemas["ShippingOption"];
export type ShippingOptions = Schemas["ShippingOptions"];
export type PaymentMethod = Schemas["PaymentMethod"];
export type PaymentMethods = Schemas["PaymentMethods"];
export type PlaceOrderInput = Schemas["PlaceOrderRequest"];
export type Order = Schemas["Order"];
export type MockPaymentOutcome = "fail" | "timeout";

/** Browser call: reserves stock for the lines for 10 minutes; throws ApiError (409 out of stock). */
export async function createCheckoutReservation(
  input: CreateReservationInput,
  signal?: AbortSignal,
): Promise<Reservation> {
  return unwrap(await api.POST("/api/checkout/reservations", { body: input, signal }));
}

/** Browser call: the reservation with its current status. */
export async function getCheckoutReservation(
  id: string,
  signal?: AbortSignal,
): Promise<Reservation> {
  return unwrap(
    await api.GET("/api/checkout/reservations/{id}", { params: { path: { id } }, signal }),
  );
}

/** Browser call: shipping options; with a reservation id the fees are those of the reserved items. */
export async function listShippingOptions(
  reservationId?: string,
  signal?: AbortSignal,
): Promise<ShippingOptions> {
  return unwrap(
    await api.GET("/api/checkout/shipping-options", {
      params: { query: reservationId ? { reservationId } : {} },
      signal,
    }),
  );
}

/** Browser call: payment methods; an unavailable method is shown disabled. */
export async function listPaymentMethods(signal?: AbortSignal): Promise<PaymentMethods> {
  return unwrap(await api.GET("/api/checkout/payment-methods", { signal }));
}

export interface PlaceOrderOptions {
  /** Client-generated UUID that makes the call safe to retry. */
  idempotencyKey: string;
  /** Demo only: forces the mock payment outcome (`X-Mock-Payment-Outcome`). */
  mockOutcome?: MockPaymentOutcome;
  signal?: AbortSignal;
}

/** Browser call: places the order from an active reservation; throws ApiError on a problem. */
export async function placeOrder(
  input: PlaceOrderInput,
  options: PlaceOrderOptions,
): Promise<Order> {
  const { idempotencyKey, mockOutcome, signal } = options;
  return unwrap(
    await api.POST("/api/orders", {
      params: {
        header: {
          "Idempotency-Key": idempotencyKey,
          ...(mockOutcome ? { "X-Mock-Payment-Outcome": mockOutcome } : {}),
        },
      },
      body: input,
      signal,
    }),
  );
}

/** Browser call: the order with its current status and payment. */
export async function getOrder(id: string, signal?: AbortSignal): Promise<Order> {
  return unwrap(await api.GET("/api/orders/{id}", { params: { path: { id } }, signal }));
}
