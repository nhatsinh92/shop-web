"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { orderQueries } from "./queries";

import type { Order } from "./api";

export const POLL_INTERVAL_MS = 2_000;
export const POLL_BUDGET_MS = 30_000;

/**
 * Polls `orderKeys.detail` every 2 s for up to 30 s while the payment is `PENDING_PAYMENT`.
 * `onSettled` gets the first answer that is no longer pending; `onTimeout` fires once when the
 * budget runs out first. Both are kept in refs, so callers may pass inline functions.
 */
export function useOrderPolling(
  order: Order,
  {
    onSettled,
    onTimeout,
  }: { onSettled: (order: Order) => void; onTimeout: (order: Order) => void },
): void {
  const done = useRef(false);
  const callbacks = useRef({ onSettled, onTimeout });
  useEffect(() => {
    callbacks.current = { onSettled, onTimeout };
  });

  const query = useQuery({ ...orderQueries.detail(order.id), refetchInterval: POLL_INTERVAL_MS });

  const polled = query.data;
  useEffect(() => {
    if (polled && polled.status !== "PENDING_PAYMENT" && !done.current) {
      done.current = true;
      callbacks.current.onSettled(polled);
    }
  }, [polled]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (done.current) return;
      done.current = true;
      callbacks.current.onTimeout(order);
    }, POLL_BUDGET_MS);
    return () => clearTimeout(timer);
  }, [order]);
}
