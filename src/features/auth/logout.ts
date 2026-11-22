"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api, unwrap } from "@/lib/api";
import { clearPersistedCache } from "@/lib/query/persister";

import { notifySessionHintChanged } from "./session-hint";

const HINT_COOKIE = "logged_in";

/**
 * Removes every trace of the user from the browser: query cache first (the persister writes on a
 * throttle, so clearing it later could race), then the hint cookie, then the IndexedDB copy.
 */
export async function clearUserData(queryClient: QueryClient): Promise<void> {
  queryClient.clear();
  document.cookie = `${HINT_COOKIE}=; Max-Age=0; path=/`;
  notifySessionHintChanged();
  try {
    await clearPersistedCache();
  } catch {
    // Nothing more can be done in the browser; the in-memory cache is already empty.
  }
}

/** Logs out. The local cleanup runs whether or not the logout call succeeds. */
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      try {
        unwrap(await api.POST("/api/auth/logout"));
      } catch {
        // Cleanup below must happen even when the server is unreachable.
      } finally {
        await clearUserData(queryClient);
        router.replace("/");
      }
    },
  });
}
