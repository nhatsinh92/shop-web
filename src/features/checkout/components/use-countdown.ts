"use client";

import { useCallback, useSyncExternalStore } from "react";

const TICK_MS = 250;

/**
 * Whole seconds left until `expiresAt`, or `null` before mount (the server has no clock that
 * matches the browser's, so the first render shows a placeholder instead of a mismatching time).
 * One `setInterval` per mount; each tick re-reads `Date.now()`, so a throttled background tab or
 * a jump of fake timers shows the true remaining time.
 */
export function useCountdown(expiresAt: string): number | null {
  const subscribe = useCallback((onTick: () => void) => {
    const timer = setInterval(onTick, TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const getSnapshot = useCallback(
    () => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)),
    [expiresAt],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** `mm:ss`, or a placeholder while the clock is not known yet. */
export function formatCountdown(seconds: number | null): string {
  if (seconds === null) return "--:--";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
