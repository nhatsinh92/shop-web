import { writeCartCount } from "@/lib/hints/cart-count";

/**
 * The single write point of the `cart_count` hint: every successful cart read or write passes its
 * `itemCount` through here. Failed requests never reach it, so the last known hint survives.
 * Does nothing outside the browser (the hint is a cookie).
 */
export function recordCartCount(itemCount: number): void {
  if (typeof document === "undefined") return;
  writeCartCount(itemCount);
}
