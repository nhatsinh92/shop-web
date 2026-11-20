"use client";

import { useEffect, useState, type ReactNode } from "react";

const mockingEnabled = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

/**
 * Local mock mode (`make dev-mock`): starts the MSW service worker before rendering, so every
 * /api/* request is answered by the handlers in mocks/. Without the flag this renders children
 * immediately and never loads MSW.
 */
export function MockServiceWorker({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!mockingEnabled);

  useEffect(() => {
    if (!mockingEnabled) return;
    let cancelled = false;
    void import("./start-mock-worker")
      .then(({ startMockWorker }) => startMockWorker())
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? children : null;
}
