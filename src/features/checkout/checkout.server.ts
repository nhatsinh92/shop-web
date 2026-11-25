import "server-only";

import { cookies } from "next/headers";

import { ApiError } from "@/lib/api";
import { ApiTimeoutError, serverApi } from "@/lib/api/server";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

import type { PaymentMethods, Reservation, ShippingOptions } from "./api";

// Time budget (ms) for each server checkout fetch; docs/handoff/technical-notes.md § 7.
export const CHECKOUT_BUDGET_MS = 300;

/** Outcome of one server fetch; each hole renders from its own result. */
export type FetchResult<T> =
  | { status: "ok"; ok: true; data: T }
  | { status: "timeout"; ok: false }
  | { status: "notFound"; ok: false }
  | { status: "unauthorized"; ok: false }
  | { status: "error"; ok: false };

export interface CheckoutServerData {
  reservation: FetchResult<Reservation>;
  shippingOptions: FetchResult<ShippingOptions>;
  paymentMethods: FetchResult<PaymentMethods>;
}

async function settle<T>(call: () => Promise<{ data?: T }>): Promise<FetchResult<T>> {
  try {
    const { data } = await call();
    if (data === undefined) return { status: "error", ok: false };
    return { status: "ok", ok: true, data };
  } catch (error) {
    if (error instanceof ApiTimeoutError) return { status: "timeout", ok: false };
    if (error instanceof ApiError && error.status === 404) return { status: "notFound", ok: false };
    if (error instanceof ApiError && error.status === 401) {
      return { status: "unauthorized", ok: false };
    }
    console.error("checkout data unavailable", error);
    return { status: "error", ok: false };
  }
}

/**
 * The reservation, shipping options and payment methods of the current request, fetched in
 * parallel with a 300 ms budget each. Deliberately not cached (user data). Must run inside a
 * `<Suspense>` boundary because it reads the request cookies. Never throws.
 */
export async function getCheckoutForRequest(reservationId: string): Promise<CheckoutServerData> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const core = () => serverApi("core", { budgetMs: CHECKOUT_BUDGET_MS, headers });

  const [reservation, shippingOptions, paymentMethods] = await Promise.all([
    settle(() =>
      core().GET("/api/checkout/reservations/{id}", { params: { path: { id: reservationId } } }),
    ),
    settle(() =>
      core().GET("/api/checkout/shipping-options", {
        params: { query: { reservationId } },
      }),
    ),
    settle(() => core().GET("/api/checkout/payment-methods")),
  ]);
  return { reservation, shippingOptions, paymentMethods };
}
