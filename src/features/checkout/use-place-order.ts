"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { messageFor } from "@/lib/api/error-messages";

import { placeOrder } from "./api";
import { clearKey, keyForRequest } from "./idempotency-key";
import {
  isBusy,
  isKeyReused,
  isMethodUnavailable,
  isReservationConsumed,
  isReservationExpired,
  isValidationFailed,
} from "./place-order-errors";

import type { MockPaymentOutcome, Order, PaymentMethod, PlaceOrderInput } from "./api";

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

/** What the last "Đặt hàng" led to when it is not a plain success or an inline error. */
export type PlaceOutcome =
  | { kind: "failed"; order: Order }
  | { kind: "pending"; order: Order }
  /** Still `PENDING_PAYMENT` after the polling budget. */
  | { kind: "unconfirmed"; order: Order }
  | { kind: "expired" }
  | { kind: "consumed" };

export interface PlaceOrderHandlers {
  onPlaced?: (order: Order) => void;
  /** 400 `VALIDATION_FAILED`: the error carries `errors[].field`. */
  onValidationFailed?: (error: ApiError) => void;
  /** 422 `CHECKOUT_PAYMENT_METHOD_UNAVAILABLE` for the method that was sent. */
  onMethodUnavailable?: (method: PaymentMethod["id"]) => void;
}

export interface PlaceOrderState {
  /** The placed order (`PLACED` or `PAID`); undefined until then. */
  order: Order | undefined;
  outcome: PlaceOutcome | undefined;
  pending: boolean;
  /** User-facing message of the last failure. */
  error: string | undefined;
  place: (input: PlaceOrderInput, mockOutcome?: MockPaymentOutcome) => Promise<void>;
  /** Feeds a polled order into the same outcome handling as the place-order answer. */
  settle: (order: Order) => void;
  /** The polling budget ran out while the payment was still pending. */
  giveUp: (order: Order) => void;
  /** Back to the form: forgets the payment outcome. */
  reset: () => void;
}

/**
 * Places the order once per attempt: a stable Idempotency-Key, a 10 s timeout, a guard against a
 * double click, a retry of 409 `IDEMPOTENCY_IN_PROGRESS` after 1 s with the same key (5 times),
 * and one automatic retry with a new key after 422 `IDEMPOTENCY_KEY_REUSED`. Every documented
 * non-success outcome is mapped here: `outcome` for payment and reservation states, callbacks for
 * form fields and payment methods, a toast for 429 and 503, `error` for the rest.
 */
export function usePlaceOrder(handlers: PlaceOrderHandlers = {}): PlaceOrderState {
  const [order, setOrder] = useState<Order>();
  const [outcome, setOutcome] = useState<PlaceOutcome>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const running = useRef(false);
  const mounted = useRef(true);
  const handlersRef = useRef(handlers);
  const reservationRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    handlersRef.current = handlers;
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Routes an order by its status; returns after the state is set. */
  const settle = useCallback((placed: Order) => {
    if (!mounted.current) return;
    if (placed.status === "PLACED" || placed.status === "PAID") {
      if (reservationRef.current) clearKey(reservationRef.current);
      setOutcome(undefined);
      setOrder(placed);
      handlersRef.current.onPlaced?.(placed);
    } else if (placed.status === "PAYMENT_FAILED") {
      if (reservationRef.current) clearKey(reservationRef.current);
      setOutcome({ kind: "failed", order: placed });
    } else {
      setOutcome({ kind: "pending", order: placed });
    }
  }, []);

  const place = useCallback(async (input: PlaceOrderInput, mockOutcome?: MockPaymentOutcome) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError(undefined);
    setOutcome(undefined);
    const { reservationId } = input;
    reservationRef.current = reservationId;
    let keyReusedRetried = false;
    try {
      for (let attempt = 0; ; attempt += 1) {
        // The demo outcome is part of what the server fingerprints, so it is part of the hash too.
        const idempotencyKey = keyForRequest(reservationId, [input, mockOutcome ?? null]);
        try {
          const placed = await placeOrder(input, {
            idempotencyKey,
            mockOutcome,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (placed.status === "PLACED" || placed.status === "PAID") {
            clearKey(reservationId);
            if (mounted.current) {
              setOutcome(undefined);
              setOrder(placed);
            }
            handlersRef.current.onPlaced?.(placed);
          } else if (placed.status === "PAYMENT_FAILED") {
            clearKey(reservationId);
            if (mounted.current) setOutcome({ kind: "failed", order: placed });
          } else if (mounted.current) {
            setOutcome({ kind: "pending", order: placed });
          }
          return;
        } catch (failure) {
          if (isInProgress(failure) && attempt < IN_PROGRESS_RETRIES) {
            await wait(IN_PROGRESS_DELAY_MS);
            continue;
          }
          if (isKeyReused(failure) && !keyReusedRetried) {
            keyReusedRetried = true;
            clearKey(reservationId);
            continue;
          }
          throw failure;
        }
      }
    } catch (failure) {
      if (endsAttempt(failure)) clearKey(reservationId);
      if (!mounted.current) return;
      if (isReservationExpired(failure)) setOutcome({ kind: "expired" });
      else if (isReservationConsumed(failure)) setOutcome({ kind: "consumed" });
      else if (isValidationFailed(failure)) handlersRef.current.onValidationFailed?.(failure);
      else if (isBusy(failure)) toast.error(messageFor(failure));
      else {
        if (isMethodUnavailable(failure))
          handlersRef.current.onMethodUnavailable?.(input.paymentMethod);
        setError(isTimeout(failure) ? TIMEOUT_MESSAGE : messageFor(failure));
      }
    } finally {
      running.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const giveUp = useCallback((unconfirmed: Order) => {
    if (mounted.current) setOutcome({ kind: "unconfirmed", order: unconfirmed });
  }, []);
  const reset = useCallback(() => setOutcome(undefined), []);

  return { order, outcome, pending, error, place, settle, giveUp, reset };
}
