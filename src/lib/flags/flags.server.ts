import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";

import type { components } from "@/lib/api/generated/core";
import { serverApi } from "@/lib/api/server";

export type FeatureFlags = components["schemas"]["FeatureFlags"];

// Time budget (ms) for the flags call; docs/handoff/technical-notes.md § 7.
export const FLAGS_BUDGET_MS = 100;

/** Safe defaults: when the flags are unknown, every feature stays on. */
export const DEFAULT_FLAGS: FeatureFlags = {
  recommendations: true,
  memberPrice: true,
  onlinePayment: true,
};

// z.object strips unknown properties, so the result has exactly the three known keys.
const flagsSchema = z.object({
  recommendations: z.boolean(),
  memberPrice: z.boolean(),
  onlinePayment: z.boolean(),
});

/**
 * The operator's feature flags, cached for about 5 s per server instance. Never rejects: any
 * failure (error status, network, malformed body, budget exceeded) is logged once and answered
 * with {@link DEFAULT_FLAGS}.
 */
export async function getFlags(): Promise<FeatureFlags> {
  "use cache";
  cacheLife({ stale: 5, revalidate: 5, expire: 60 });
  cacheTag("flags");

  try {
    const { data } = await serverApi("core", { budgetMs: FLAGS_BUDGET_MS }).GET("/api/flags");
    return flagsSchema.parse(data);
  } catch (error) {
    console.error("getFlags: GET /api/flags failed, using default flags", error);
    return { ...DEFAULT_FLAGS };
  }
}
