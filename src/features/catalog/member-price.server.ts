import "server-only";

import { cookies } from "next/headers";

import { serverApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api";
import { ApiTimeoutError } from "@/lib/api/server";
import { getFlags } from "@/lib/flags";
import { ACCESS_COOKIE, SESSION_HINT_COOKIE } from "@/lib/auth/cookies";

import type { MemberPrice } from "./api";

// Time budget (ms) for the member price hole; docs/handoff/technical-notes.md § 7.
export const MEMBER_PRICE_BUDGET_MS = 250;

export type MemberPriceResult =
  | { kind: "price"; price: MemberPrice }
  /** No session at all: show the login prompt. */
  | { kind: "guest" }
  /** The server cannot answer (slow, expired token, hint without token): ask from the browser. */
  | { kind: "client" }
  /** Any other failure: render nothing. */
  | { kind: "none" };

/**
 * Member price of a product, deliberately not cached (it is user data). Must run inside a
 * `<Suspense>` boundary because it reads the request cookies. Never throws.
 */
export async function getMemberPriceForRequest(slug: string): Promise<MemberPriceResult> {
  const startedAt = performance.now();
  // Flags first (usually a 5 s cache hit): with the flag off, no cookie is read and no endpoint
  // is called, neither here nor from the browser (`MemberPrice` renders nothing for "none").
  if (!(await getFlags()).memberPrice) return { kind: "none" };
  const budgetMs = Math.max(1, MEMBER_PRICE_BUDGET_MS - (performance.now() - startedAt));
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  if (!accessToken) {
    return jar.get(SESSION_HINT_COOKIE)?.value === "1" ? { kind: "client" } : { kind: "guest" };
  }
  try {
    const { data } = await serverApi("core", {
      budgetMs,
      headers: { authorization: `Bearer ${accessToken}` },
    }).GET("/api/products/{slug}/member-price", { params: { path: { slug } } });
    return data ? { kind: "price", price: data } : { kind: "none" };
  } catch (error) {
    if (error instanceof ApiTimeoutError) return { kind: "client" };
    if (error instanceof ApiError && error.status === 401) return { kind: "client" };
    console.error("member price unavailable, hiding the line", error);
    return { kind: "none" };
  }
}
