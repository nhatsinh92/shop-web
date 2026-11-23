import { api, unwrap } from "@/lib/api";

import type { CoreComponents } from "@/lib/api";

export type MemberPrice = CoreComponents["schemas"]["MemberPrice"];

/** Browser call through /api/*; a 401 is refreshed once by the browser client and retried. */
export async function getMemberPrice(slug: string, signal?: AbortSignal): Promise<MemberPrice> {
  return unwrap(
    await api.GET("/api/products/{slug}/member-price", { params: { path: { slug } }, signal }),
  );
}
