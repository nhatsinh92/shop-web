import { z } from "zod";

/**
 * Provisional shape of the cart summary used by the header badge.
 * Phase 1 (epic contract-client) replaces it with the type generated from cart.yaml.
 */
export const cartSummarySchema = z.object({
  itemCount: z.number().int().nonnegative(),
});

export type CartSummary = z.infer<typeof cartSummarySchema>;
