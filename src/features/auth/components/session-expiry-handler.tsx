"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { onSessionExpired } from "@/lib/api";

import { clearUserData } from "../logout";

/** Renders nothing. Cleans up and sends the user to /login when a session refresh fails. */
export function SessionExpiryHandler() {
  const queryClient = useQueryClient();
  const router = useRouter();
  useEffect(
    () =>
      onSessionExpired(() => {
        void clearUserData(queryClient).then(() => router.replace("/login"));
      }),
    [queryClient, router],
  );
  return null;
}
