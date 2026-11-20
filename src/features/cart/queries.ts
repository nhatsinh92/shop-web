import { queryOptions } from "@tanstack/react-query";

import { getCartSummary } from "./api";

/** Query key factory: every cart query key starts with cartKeys.all. */
export const cartKeys = {
  all: ["cart"] as const,
  summary: () => [...cartKeys.all, "summary"] as const,
};

export const cartQueries = {
  summary: () =>
    queryOptions({
      queryKey: cartKeys.summary(),
      queryFn: ({ signal }) => getCartSummary(signal),
      staleTime: 15_000,
    }),
};
