import type { components } from "../../src/lib/api/generated/core";

export type FeatureFlags = components["schemas"]["FeatureFlags"];

/** Every feature on: the default answer of `GET /api/flags`. */
export const flagsAllOn: FeatureFlags = {
  recommendations: true,
  memberPrice: true,
  onlinePayment: true,
};

/** Every feature off: the peak-load degraded state. */
export const flagsAllOff: FeatureFlags = {
  recommendations: false,
  memberPrice: false,
  onlinePayment: false,
};
