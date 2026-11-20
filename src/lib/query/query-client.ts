import { QueryClient } from "@tanstack/react-query";

/** Query defaults shared by the browser and by server-side prefetching. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid an immediate refetch on the client after server hydration.
        staleTime: 30_000,
        // Kept long enough for persisted queries to survive a reload.
        gcTime: 24 * 60 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
