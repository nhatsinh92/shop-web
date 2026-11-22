import { z } from "zod";

import type { components } from "@/lib/api/generated/core";

type ProductUpdated = components["schemas"]["ProductUpdated"];

/** Cache tags the webhook may revalidate: `ProductUpdated.tags` pattern from the contract. */
export const ALLOWED_TAG = /^(products|flash-sale|product-[0-9a-f-]{36})$/;

/** Only `tags` of the `ProductUpdated` event is used; the other fields are ignored. */
export const revalidateBodySchema = z.object({
  tags: z.array(z.string().regex(ALLOWED_TAG)).min(1),
}) satisfies z.ZodType<Pick<ProductUpdated, "tags">, unknown>;

export type RevalidateBody = z.infer<typeof revalidateBodySchema>;
