"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";

import { MockServiceWorker } from "@/lib/mocking/mock-service-worker";
import { makeQueryClient } from "@/lib/query/query-client";
import { persistOptions } from "@/lib/query/persister";

/**
 * Client-side providers. One QueryClient per browser session (per request on the server).
 * IndexedDB persistence is wired here but persists nothing until a query opts in with
 * `meta: { persist: true }` (the cart, Phase 4).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <MockServiceWorker>{children}</MockServiceWorker>
    </PersistQueryClientProvider>
  );
}
