import { delay, http, HttpResponse } from "msw";

import {
  buildReservation,
  FIRST_ORDER_NUMBER,
  orderNumber,
  paymentMethodFixtures,
  RESERVATION_TTL_MS,
  reservationItem,
  shippingOptionFixtures,
  vnd,
  type Order,
  type Reservation,
  type ReservationItem,
} from "./fixtures/checkout";
import { coreHttp } from "./http";

import type { components } from "../src/lib/api/generated/core";

type Schemas = components["schemas"];
type Problem = Schemas["Problem"];
type PlaceOrderRequest = Schemas["PlaceOrderRequest"];
type CreateReservationRequest = Schemas["CreateReservationRequest"];
type PaymentOutcome = "fail" | "timeout" | null;

type StoredResponse = {
  fingerprint: string;
  order: Order;
  /** The first answer was 201; replays answer 201 too, with `Idempotent-Replayed: true`. */
  orderId: string;
};

type Reservations = Map<string, { reservation: Reservation; expiresAtMs: number }>;

const reservations: Reservations = new Map();
const orders = new Map<string, Order>();
const idempotency = new Map<string, StoredResponse>();
/** Remaining `getOrder` reads before an order created by `orderPendingPayment` becomes PAID. */
const pendingPolls = new Map<string, number>();

/** The shared in-memory reservation, order and idempotency store behind the checkout handlers. */
export const checkoutState = {
  reset(): void {
    reservations.clear();
    orders.clear();
    idempotency.clear();
    pendingPolls.clear();
  },
  orderCount: (): number => orders.size,
  orders: (): Order[] => [...orders.values()],
  reservation(id: string): Reservation | undefined {
    return readReservation(id);
  },
};

// Tests reset MSW handlers after each test (vitest.setup.ts); reset the store at the same moment.
if (typeof afterEach === "function") afterEach(() => checkoutState.reset());

const problemHeaders = () => new Headers({ "Content-Type": "application/problem+json" });

function problem(status: number, code: string, title: string): Problem {
  return { type: "about:blank", title, status, code };
}

/** The stored reservation, reported as `EXPIRED` once `expiresAt` has passed. */
function readReservation(id: string): Reservation | undefined {
  const entry = reservations.get(id);
  if (!entry) return undefined;
  const { reservation, expiresAtMs } = entry;
  const expired = reservation.status === "ACTIVE" && Date.now() >= expiresAtMs;
  return structuredClone(expired ? { ...reservation, status: "EXPIRED" } : reservation);
}

/** Builds the reserved lines; the first unknown SKU makes the whole request invalid. */
function reserveLines(body: CreateReservationRequest): ReservationItem[] | null {
  const items: ReservationItem[] = [];
  for (const line of body.items) {
    const item = reservationItem(line.sku, line.quantity, line.expectedUnitPrice?.amount);
    if (!item) return null;
    items.push(item);
  }
  return items;
}

/** A new reservation replaces the user's previous active one, which is released. */
function storeReservation(items: ReservationItem[], ttlMs: number): Reservation {
  for (const [id, entry] of reservations) {
    if (readReservation(id)?.status === "ACTIVE") {
      reservations.set(id, {
        ...entry,
        reservation: { ...entry.reservation, status: "RELEASED" },
      });
    }
  }
  const expiresAtMs = Date.now() + ttlMs;
  const reservation = buildReservation(
    crypto.randomUUID(),
    items,
    new Date(expiresAtMs).toISOString(),
  );
  reservations.set(reservation.id, { reservation, expiresAtMs });
  return structuredClone(reservation);
}

type ReserveOptions = { ttlMs?: number; outOfStock?: boolean };

const createReservationHandler = ({
  ttlMs = RESERVATION_TTL_MS,
  outOfStock = false,
}: ReserveOptions = {}) =>
  coreHttp.post("/api/checkout/reservations", async ({ request, response }) => {
    const body = (await request.json()) as CreateReservationRequest;
    const items = body.items.length > 0 ? reserveLines(body) : null;
    if (!items) {
      return response(400).json(problem(400, "VALIDATION_FAILED", "Validation failed"), {
        headers: problemHeaders(),
      });
    }
    if (outOfStock) {
      return response(409).json(
        {
          ...problem(409, "CHECKOUT_OUT_OF_STOCK", "Out of stock"),
          unavailable: body.items.map(({ sku, quantity }) => ({
            sku,
            requested: quantity,
            available: Math.max(0, quantity - 1),
          })),
        },
        { headers: problemHeaders() },
      );
    }
    return response(201).json(storeReservation(items, ttlMs));
  });

const notFound = (code: string, title: string) => problem(404, code, title);

const getReservationHandler = (delayMs = 0) =>
  coreHttp.get("/api/checkout/reservations/{id}", async ({ params, response }) => {
    if (delayMs > 0) await delay(delayMs);
    const reservation = readReservation(params.id);
    if (!reservation) {
      return response(404).json(
        notFound("CHECKOUT_RESERVATION_NOT_FOUND", "Reservation not found"),
        { headers: problemHeaders() },
      );
    }
    return response(200).json(reservation);
  });

const shippingOptionsHandler = (delayMs = 0) =>
  coreHttp.get("/api/checkout/shipping-options", async ({ request, response }) => {
    if (delayMs > 0) await delay(delayMs);
    const id = new URL(request.url).searchParams.get("reservationId");
    if (id && !reservations.has(id)) {
      return response(404).json(
        notFound("CHECKOUT_RESERVATION_NOT_FOUND", "Reservation not found"),
        { headers: problemHeaders() },
      );
    }
    return response(200).json({ items: structuredClone(shippingOptionFixtures) });
  });

const paymentMethodsHandler = (options: { delayMs?: number; cardAvailable?: boolean } = {}) =>
  coreHttp.get("/api/checkout/payment-methods", async ({ response }) => {
    if (options.delayMs) await delay(options.delayMs);
    return response(200).json({ items: paymentMethodFixtures(options) });
  });

const PHONE = /^(\+84|0)\d{9}$/;

/** Field errors for the shipping address; the phone must be a Vietnamese number. */
function addressErrors(address: PlaceOrderRequest["shippingAddress"]) {
  const errors: { field: string; code: string; message: string }[] = [];
  const required = ["fullName", "line1", "ward", "province"] as const;
  for (const key of required) {
    if (!address[key]?.trim()) {
      errors.push({ field: `shippingAddress.${key}`, code: "REQUIRED", message: "Required" });
    }
  }
  if (!PHONE.test(address.phone ?? "")) {
    errors.push({
      field: "shippingAddress.phone",
      code: "INVALID_PHONE",
      message: "Invalid phone number",
    });
  }
  return errors;
}

function buildOrder(
  body: PlaceOrderRequest,
  items: ReservationItem[],
  outcome: PaymentOutcome,
  pending: boolean,
): Order {
  const fee = shippingOptionFixtures.find((o) => o.id === body.shippingOptionId)?.fee.amount ?? 0;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal.amount, 0);
  const online = body.paymentMethod !== "COD";
  const status = !online ? "PLACED" : pending ? "PENDING_PAYMENT" : "PAID";
  const paymentStatus = !online ? "NOT_REQUIRED" : pending ? "PENDING" : "SUCCEEDED";
  const failed = online && !pending && outcome !== null;
  return {
    id: crypto.randomUUID(),
    number: orderNumber(FIRST_ORDER_NUMBER + orders.size),
    status: failed ? "PAYMENT_FAILED" : status,
    items: items.map(({ sku, quantity, unitPrice, lineTotal }) => ({
      sku,
      quantity,
      unitPrice,
      lineTotal,
    })),
    subtotal: vnd(subtotal),
    shippingFee: vnd(fee),
    total: vnd(subtotal + fee),
    payment: {
      method: body.paymentMethod,
      status: failed ? (outcome === "timeout" ? "TIMED_OUT" : "FAILED") : paymentStatus,
    },
    createdAt: new Date().toISOString(),
  };
}

type PlaceOptions = {
  /** The first `n` calls answer 409 `IDEMPOTENCY_IN_PROGRESS`. */
  inProgressTimes?: number;
  /** Online payments answer `PENDING_PAYMENT` and turn `PAID` after this many `getOrder` reads. */
  pendingPolls?: number;
  cardAvailable?: boolean;
};

const placeOrderHandler = (options: PlaceOptions = {}) => {
  let inProgressLeft = options.inProgressTimes ?? 0;
  return coreHttp.post("/api/orders", async ({ request, response }) => {
    const key = request.headers.get("Idempotency-Key");
    if (!key) {
      return response(400).json(
        problem(400, "IDEMPOTENCY_KEY_MISSING", "Idempotency-Key header is missing"),
        { headers: problemHeaders() },
      );
    }
    if (inProgressLeft > 0) {
      inProgressLeft -= 1;
      return response(409).json(
        problem(409, "IDEMPOTENCY_IN_PROGRESS", "Request is still being processed"),
        { headers: problemHeaders() },
      );
    }
    const body = (await request.json()) as PlaceOrderRequest;
    const header = request.headers.get("X-Mock-Payment-Outcome");
    const outcome: PaymentOutcome = header === "fail" || header === "timeout" ? header : null;
    // The mock outcome is part of the idempotency fingerprint, as in the contract.
    const fingerprint = JSON.stringify([body, outcome]);

    const stored = idempotency.get(key);
    if (stored) {
      if (stored.fingerprint !== fingerprint) {
        return response(422).json(
          problem(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key was used with another body"),
          { headers: problemHeaders() },
        );
      }
      const original = orders.get(stored.orderId) ?? stored.order;
      return response(201).json(original, { headers: { "Idempotent-Replayed": "true" } });
    }

    const errors = addressErrors(body.shippingAddress);
    if (errors.length > 0) {
      return response(400).json(
        { ...problem(400, "VALIDATION_FAILED", "Validation failed"), errors },
        { headers: problemHeaders() },
      );
    }
    const reservation = readReservation(body.reservationId);
    if (!reservation) {
      return response(404).json(
        notFound("CHECKOUT_RESERVATION_NOT_FOUND", "Reservation not found"),
        { headers: problemHeaders() },
      );
    }
    if (reservation.status === "CONSUMED") {
      return response(410).json(
        problem(410, "CHECKOUT_RESERVATION_CONSUMED", "Reservation already used"),
        { headers: problemHeaders() },
      );
    }
    if (reservation.status !== "ACTIVE") {
      return response(410).json(
        problem(410, "CHECKOUT_RESERVATION_EXPIRED", "Reservation expired"),
        { headers: problemHeaders() },
      );
    }
    if (body.paymentMethod === "CARD" && options.cardAvailable === false) {
      return response(422).json(
        problem(422, "CHECKOUT_PAYMENT_METHOD_UNAVAILABLE", "Payment method unavailable"),
        { headers: problemHeaders() },
      );
    }

    const pending = options.pendingPolls !== undefined && body.paymentMethod !== "COD";
    const order = buildOrder(body, reservation.items, outcome, pending);
    orders.set(order.id, order);
    if (pending) pendingPolls.set(order.id, options.pendingPolls ?? 0);
    idempotency.set(key, { fingerprint, order, orderId: order.id });
    const entry = reservations.get(body.reservationId);
    if (entry) {
      reservations.set(body.reservationId, {
        ...entry,
        reservation: { ...entry.reservation, status: "CONSUMED" },
      });
    }
    return response(201).json(order, { headers: { "Idempotent-Replayed": "false" } });
  });
};

const getOrderHandler = () =>
  coreHttp.get("/api/orders/{id}", ({ params, response }) => {
    const order = orders.get(params.id);
    if (!order) {
      return response(404).json(notFound("ORDER_NOT_FOUND", "Order not found"), {
        headers: problemHeaders(),
      });
    }
    const left = pendingPolls.get(order.id);
    if (left !== undefined) {
      if (left > 0) {
        pendingPolls.set(order.id, left - 1);
      } else {
        pendingPolls.delete(order.id);
        const paid: Order = {
          ...order,
          status: "PAID",
          payment: { ...order.payment, status: "SUCCEEDED" },
        };
        orders.set(order.id, paid);
        return response(200).json(structuredClone(paid));
      }
    }
    return response(200).json(structuredClone(order));
  });

/** Default handlers: all six checkout and order operations on the shared in-memory store. */
export const checkoutHandlers = [
  createReservationHandler(),
  getReservationHandler(),
  shippingOptionsHandler(),
  paymentMethodsHandler(),
  placeOrderHandler(),
  getOrderHandler(),
];

/** 503 is not a documented checkout response, so these use plain MSW instead of `coreHttp`. */
const unavailable = () =>
  HttpResponse.json(problem(503, "SERVICE_UNAVAILABLE", "Unavailable"), {
    status: 503,
    headers: problemHeaders(),
  });

/** Per-scenario overrides for `server.use(...)` in tests and the dev mock. */
export const checkoutOverrides = {
  /** 409 `CHECKOUT_OUT_OF_STOCK` on `POST /api/checkout/reservations`, `available` per line. */
  reservationOutOfStock: createReservationHandler({ outOfStock: true }),
  /** New reservations expire `ms` milliseconds after they are created (`0` expires at once). */
  reservationExpiresIn: (ms: number) => createReservationHandler({ ttlMs: ms }),
  /** The reservation, shipping-options and payment-methods reads answer after `ms` milliseconds. */
  slowCheckout: (ms: number) => [
    getReservationHandler(ms),
    shippingOptionsHandler(ms),
    paymentMethodsHandler({ delayMs: ms }),
  ],
  /** 503 `SERVICE_UNAVAILABLE` on every checkout and order operation. */
  checkoutUnavailable: [
    http.post("*/api/checkout/reservations", unavailable),
    http.get("*/api/checkout/reservations/:id", unavailable),
    http.get("*/api/checkout/shipping-options", unavailable),
    http.get("*/api/checkout/payment-methods", unavailable),
    http.post("*/api/orders", unavailable),
    http.get("*/api/orders/:id", unavailable),
  ],
  /** The first `times` `POST /api/orders` calls answer 409 `IDEMPOTENCY_IN_PROGRESS`. */
  orderInProgress: (times: number) => placeOrderHandler({ inProgressTimes: times }),
  /** Online payments answer 201 `PENDING_PAYMENT`, then `PAID` after `polls` reads of the order. */
  orderPendingPayment: (polls: number) => [
    placeOrderHandler({ pendingPolls: polls }),
    getOrderHandler(),
  ],
  /** The card is `available: false`, and placing an order with it answers 422. */
  cardUnavailable: [
    paymentMethodsHandler({ cardAvailable: false }),
    placeOrderHandler({ cardAvailable: false }),
  ],
};
