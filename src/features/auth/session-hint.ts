"use client";

import { useSyncExternalStore } from "react";

export type SessionHint = "signed-in" | "guest" | "unknown";

const HINT_COOKIE = "logged_in";
const listeners = new Set<() => void>();

/**
 * Reads the non-httpOnly `logged_in` hint cookie. The hint only tells the browser that a session
 * may exist; it is never used for authorisation.
 */
function readHint(): SessionHint {
  const pairs = document.cookie.split(";");
  for (const pair of pairs) {
    const [name, value] = pair.trim().split("=");
    if (name === HINT_COOKIE) return value === "1" ? "signed-in" : "guest";
  }
  return "guest";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call after the hint cookie changed (login, logout) so mounted components re-render. */
export function notifySessionHintChanged(): void {
  listeners.forEach((listener) => listener());
}

/** `"unknown"` on the server and during hydration, then `"signed-in"` or `"guest"`. */
export function useSessionHint(): SessionHint {
  return useSyncExternalStore(subscribe, readHint, () => "unknown");
}
