import { queryOptions } from "@tanstack/react-query";

import { getMemberPrice } from "./api";

/** Query key factory: every catalog query key starts with catalogKeys.all. */
export const catalogKeys = {
  all: ["catalog"] as const,
  memberPrice: (slug: string) => [...catalogKeys.all, "member-price", slug] as const,
};

export const catalogQueries = {
  // User-specific: never persisted (no `meta.persist`).
  memberPrice: (slug: string) =>
    queryOptions({
      queryKey: catalogKeys.memberPrice(slug),
      queryFn: ({ signal }) => getMemberPrice(slug, signal),
      staleTime: 60_000,
      retry: false,
    }),
};
