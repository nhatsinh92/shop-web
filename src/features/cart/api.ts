import { apiFetch } from "@/lib/http/api-fetch";

import { cartSummarySchema, type CartSummary } from "./cart.schema";

/** Browser call: goes to the gateway through /api/*, never through a Next.js route handler. */
export function getCartSummary(signal?: AbortSignal): Promise<CartSummary> {
  return apiFetch("/api/cart/summary", (body) => cartSummarySchema.parse(body), { signal });
}
