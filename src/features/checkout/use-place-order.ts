"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import { messageFor } from "@/lib/api/error-messages";

import { placeOrder } from "./api";
import { clearKey, keyForRequest } from "./idempotency-key";

import type { MockPaymentOutcome, Order, PlaceOrderInput } from "./api";

const TIMEOUT_MS = 10_000;
const IN_PROGRESS_DELAY_MS = 1_000;
const IN_PROGRESS_RETRIES = 5;

export const TIMEOUT_MESSAGE = "Không nhận được phản hồi. Thử lại";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isInProgress(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.code === "IDEMPOTENCY_IN_PROGRESS"
  );
}

/** A timed-out signal rejects fetch with a TimeoutError; some fetch layers wrap it in a cause. */
function isTimeout(error: unknown): boolean {
  let current: unknown = error;
  // Duck-typed: a DOMException is not always `instanceof Error` (jsdom, other realms).
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    const { name, cause } = current as { name?: unknown; cause?: unknown };
    if (name === "TimeoutError" || name === "AbortError") return true;
    current = cause;
  }
  return false;
}

/** A 4xx answer is final for this key; only the "still running" 409 keeps it. */
function endsAttempt(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status >= 400 && error.status < 500 && !isInProgress(error)
  );
}

export interface PlaceOrderState {
  /** The placed order (`PLACED` or `PAID`); undefined until then. */
  order: Order | undefined;
  pending: boolean;
  /** User-facing message of the last failure. */
  error: string | undefined;
  place: (input: PlaceOrderInput, mockOutcome?: MockPaymentOutcome) => Promise<void>;
}

/**
 * Places the order once per attempt: a stable Idempotency-Key, a 10 s timeout, a guard against a
 * double click, and a retry of 409 `IDEMPOTENCY_IN_PROGRESS` after 1 s with the same key (5 times).
 * `PENDING_PAYMENT` and `PAYMENT_FAILED` are not success here (the payment states are another task).
 */
export function usePlaceOrder(onPlaced?: (order: Order) => void): PlaceOrderState {
  const [order, setOrder] = useState<Order>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const mounted = useRef(true);
  const onPlacedRef = useRef(onPlaced);

  useEffect(() => {
    onPlacedRef.current = onPlaced;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const place = useCallback(async (input: PlaceOrderInput, mockOutcome?: MockPaymentOutcome) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(undefined);
    const { reservationId } = input;
    // The demo outcome is part of what the server fingerprints, so it is part of the hash too.
    const idempotencyKey = keyForRequest(reservationId, [input, mockOutcome ?? null]);
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const placed = await placeOrder(input, {
            idempotencyKey,
            mockOutcome,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (placed.status === "PLACED" || placed.status === "PAID") {
            clearKey(reservationId);
            if (mounted.current) setOrder(placed);
            onPlacedRef.current?.(placed);
          } else if (placed.status === "PAYMENT_FAILED") {
            clearKey(reservationId);
          }
          return;
        } catch (failure) {
          if (isInProgress(failure) && attempt < IN_PROGRESS_RETRIES) {
            await wait(IN_PROGRESS_DELAY_MS);
            continue;
          }
          throw failure;
        }
      }
    } catch (failure) {
      if (endsAttempt(failure)) clearKey(reservationId);
      if (mounted.current) setError(isTimeout(failure) ? TIMEOUT_MESSAGE : messageFor(failure));
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  return { order, pending, error, place };
}
