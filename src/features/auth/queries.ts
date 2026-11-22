import { queryOptions } from "@tanstack/react-query";

import { getMe } from "./api";

/** Query key factory: every auth query key starts with authKeys.all. */
export const authKeys = {
  all: ["auth"] as const,
  me: () => [...authKeys.all, "me"] as const,
};

export const authQueries = {
  // User data: never persisted (no meta.persist).
  me: () =>
    queryOptions({
      queryKey: authKeys.me(),
      queryFn: ({ signal }) => getMe(signal),
    }),
};
