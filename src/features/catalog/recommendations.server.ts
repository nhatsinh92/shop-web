import "server-only";

import { cookies } from "next/headers";

import { serverApi } from "@/lib/api/server";

import type { ProductSummary } from "./catalog.server";

// Time budget (ms) for the recommendations hole; docs/handoff/technical-notes.md § 7.
export const RECOMMENDATIONS_BUDGET_MS = 250;

const ACCESS_COOKIE = "access_token";

/**
 * Recommended products for the home page. Deliberately not cached: the answer may depend on the
 * signed-in user. Must run inside a `<Suspense>` boundary because it reads the request cookies.
 */
export async function listRecommendations(): Promise<ProductSummary[]> {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  const { data } = await serverApi("core", {
    budgetMs: RECOMMENDATIONS_BUDGET_MS,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
  }).GET("/api/recommendations", {});
  if (!data) throw new Error("listRecommendations returned no body");
  return data.items;
}
