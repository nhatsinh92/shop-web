import "server-only";

import { cookies } from "next/headers";

import { ApiError } from "@/lib/api";
import { ApiTimeoutError, serverApi } from "@/lib/api/server";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

import type { Cart } from "./api";

// Time budget (ms) for the server cart fetch; docs/handoff/technical-notes.md § 7.
export const CART_BUDGET_MS = 250;

const GUEST_CART_COOKIE = "guest_cart";

function emptyCart(): Cart {
  return {
    items: [],
    itemCount: 0,
    subtotal: { amount: 0, currency: "VND" },
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * The cart of the current request, deliberately not cached (it is user data). Must run inside a
 * `<Suspense>` boundary because it reads the request cookies. Returns an empty cart without a
 * backend call when there is no cart cookie, and `null` (nothing to hydrate) on a timeout, a 401
 * or any other failure. Never throws.
 */
export async function getCartForRequest(): Promise<Cart | null> {
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  const guestCart = jar.get(GUEST_CART_COOKIE)?.value;
  if (!accessToken && !guestCart) return emptyCart();

  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (guestCart) headers.cookie = `${GUEST_CART_COOKIE}=${guestCart}`;

  try {
    const { data } = await serverApi("cart", { budgetMs: CART_BUDGET_MS, headers }).GET(
      "/api/cart",
    );
    return data ?? null;
  } catch (error) {
    if (error instanceof ApiTimeoutError) return null;
    if (error instanceof ApiError && error.status === 401) return null;
    console.error("cart unavailable, nothing to hydrate", error);
    return null;
  }
}
