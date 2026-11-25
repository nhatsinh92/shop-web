"use client";

import { useSyncExternalStore } from "react";

const COOKIE_NAME = "cart_count";
const MAX_AGE_SECONDS = 2_592_000; // 30 days
const MAX_COUNT = 999;
const COUNT_PATTERN = /^(0|[1-9]\d{0,2})$/;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Writes the non-httpOnly `cart_count` hint cookie. The hint only lets the client render the right
 * badge instantly; it is never used for authorisation. A value that is not an integer in 0–999 is
 * ignored (never clamped).
 */
export function writeCartCount(count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > MAX_COUNT) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_NAME}=${count}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  notify();
}

/** The hinted cart count, or `null` when the cookie is missing or not an integer in 0–999. */
export function readCartCount(): number | null {
  for (const pair of document.cookie.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== COOKIE_NAME) continue;
    const value = pair.slice(index + 1).trim();
    return COUNT_PATTERN.test(value) ? Number(value) : null;
  }
  return null;
}

/** Removes the hint cookie. */
export function clearCartCount(): void {
  document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/`;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `null` on the server and during hydration, then the hinted count (or `null` without a hint). */
export function useCartCountHint(): number | null {
  return useSyncExternalStore(subscribe, readCartCount, () => null);
}
