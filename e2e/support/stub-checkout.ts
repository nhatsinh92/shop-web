import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import type * as ProductFixtures from "../../mocks/fixtures/products";
import type { components } from "../../src/lib/api/generated/core";

type Schemas = components["schemas"];
type Reservation = Schemas["Reservation"];
type ReservationItem = Schemas["ReservationItem"];
type Order = Schemas["Order"];
type PlaceOrderRequest = Schemas["PlaceOrderRequest"];

/** A reservation holds the stock for 10 minutes, as in the contract. */
export const HOLD_MS = 10 * 60 * 1000;
/** `checkout-short-hold` users: the first reservation lapses after this long. */
export const SHORT_HOLD_MS = 4000;

const SHIPPING_FEES = { STANDARD: 0, EXPRESS_2H: 35_000 } as const;
const PHONE = /^(0|\+84)[35789][0-9]{8}$/;

export interface CheckoutContext {
  /** Claims of the access token (Bearer from the server, else the cookie); null when absent. */
  token: { email: string; exp: number } | null;
  /** Scenario tag of the signed-in user. */
  scenario: string;
}

interface StoredReservation {
  email: string;
  id: string;
  expiresAt: number;
  items: ReservationItem[];
  consumed: boolean;
}

interface StoredOrder {
  fingerprint: string;
  order: Order;
}

// All state is keyed by the user's email, so parallel tests never see each other's data.
const reservations = new Map<string, StoredReservation>();
const reservationCount = new Map<string, number>();
const orders = new Map<string, StoredOrder>();
const placedOrders = new Map<string, Order[]>();
const orderAttempts = new Map<string, number>();
let orderSequence = 0;

let fixtures: Promise<typeof ProductFixtures> | undefined;
function loadFixtures(): Promise<typeof ProductFixtures> {
  fixtures ??= import(pathToFileURL(resolve("mocks/fixtures/products.ts")).href) as Promise<
    typeof ProductFixtures
  >;
  return fixtures;
}

const money = (amount: number) => ({ amount, currency: "VND" as const });

function json(
  res: ServerResponse,
  status: number,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = { "cache-control": "no-store", ...extra };
  if (body !== undefined) headers["content-type"] ??= "application/json";
  res.writeHead(status, headers);
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function problem(
  res: ServerResponse,
  status: number,
  code: string,
  title: string,
  extra: Record<string, unknown> = {},
) {
  json(
    res,
    status,
    { type: `about:blank#${code}`, title, status, code, ...extra },
    { "content-type": "application/problem+json" },
  );
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((done) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    req.on("end", () => done(raw));
  });
}

async function readJson(req: IncomingMessage): Promise<{ raw: string; value: unknown }> {
  const raw = await readBody(req);
  try {
    return { raw, value: JSON.parse(raw || "{}") as unknown };
  } catch {
    return { raw, value: null };
  }
}

async function reservedLine(sku: string, quantity: number): Promise<ReservationItem | null> {
  const f = await loadFixtures();
  const product = f.productSummaryFixtures.find((p) => p.sku === sku);
  const availability = f.availabilityFixtures[sku];
  if (!product || !availability) return null;
  const unit = availability.price.amount;
  return {
    sku,
    name: product.name,
    imageUrl: product.imageUrl,
    quantity,
    unitPrice: money(unit),
    lineTotal: money(unit * quantity),
    priceChanged: false,
  };
}

function view(stored: StoredReservation): Reservation {
  const expired = stored.expiresAt <= Date.now();
  return {
    id: stored.id,
    status: stored.consumed ? "CONSUMED" : expired ? "EXPIRED" : "ACTIVE",
    expiresAt: new Date(stored.expiresAt).toISOString(),
    items: stored.items,
    subtotal: money(stored.items.reduce((sum, item) => sum + item.lineTotal.amount, 0)),
  };
}

async function createReservation(
  req: IncomingMessage,
  res: ServerResponse,
  email: string,
  scenario: string,
) {
  const { value } = await readJson(req);
  const requested = (value as { items?: { sku?: unknown; quantity?: unknown }[] } | null)?.items;
  if (!Array.isArray(requested) || requested.length === 0) {
    return problem(res, 400, "VALIDATION_FAILED", "Invalid body");
  }
  const items: ReservationItem[] = [];
  for (const entry of requested) {
    const line = await reservedLine(String(entry.sku ?? ""), Number(entry.quantity));
    if (!line || !Number.isInteger(line.quantity) || line.quantity < 1) {
      return problem(res, 400, "VALIDATION_FAILED", "Invalid body");
    }
    items.push(line);
  }
  const first = items[0];
  if (scenario === "checkout-out-of-stock" && first) {
    return problem(res, 409, "CHECKOUT_OUT_OF_STOCK", "Out of stock", {
      unavailable: [{ sku: first.sku, requested: first.quantity, available: 1 }],
    });
  }
  const count = (reservationCount.get(email) ?? 0) + 1;
  reservationCount.set(email, count);
  const short = scenario === "checkout-short-hold" && count === 1;
  const stored: StoredReservation = {
    email,
    id: randomUUID(),
    expiresAt: Date.now() + (short ? SHORT_HOLD_MS : HOLD_MS),
    items,
    consumed: false,
  };
  reservations.set(stored.id, stored);
  json(res, 201, view(stored));
}

function reservationFor(email: string, id: string | undefined): StoredReservation | null {
  const stored = id ? reservations.get(id) : undefined;
  return stored && stored.email === email ? stored : null;
}

function shippingOptions() {
  return {
    items: [
      {
        id: "STANDARD",
        name: "Giao tiêu chuẩn",
        fee: money(SHIPPING_FEES.STANDARD),
        estimatedDelivery: "Nhận hàng 2–3 ngày",
      },
      {
        id: "EXPRESS_2H",
        name: "Giao hỏa tốc 2 giờ",
        fee: money(SHIPPING_FEES.EXPRESS_2H),
        estimatedDelivery: "Nhận hàng trong 2 giờ",
      },
    ],
  };
}

function paymentMethods() {
  return {
    items: [
      { id: "COD", name: "Thanh toán khi nhận hàng (COD)", available: true },
      { id: "EWALLET", name: "Ví điện tử", available: true },
      { id: "CARD", name: "Thẻ tín dụng / ghi nợ", available: true },
    ],
  };
}

/** Field errors of the request, as `shippingAddress.<field>` paths like the real API. */
function invalidFields(body: Partial<PlaceOrderRequest> | null): string[] {
  const address = body?.shippingAddress;
  const bad: string[] = [];
  if (!address?.fullName?.trim()) bad.push("shippingAddress.fullName");
  if (!address?.phone || !PHONE.test(address.phone)) bad.push("shippingAddress.phone");
  if (!address?.line1?.trim()) bad.push("shippingAddress.line1");
  if (!address?.ward?.trim()) bad.push("shippingAddress.ward");
  if (!address?.province?.trim()) bad.push("shippingAddress.province");
  return bad;
}

function buildOrder(
  stored: StoredReservation,
  body: PlaceOrderRequest,
  outcome: string | undefined,
): Order {
  const subtotal = stored.items.reduce((sum, item) => sum + item.lineTotal.amount, 0);
  const fee = SHIPPING_FEES[body.shippingOptionId];
  const online = body.paymentMethod !== "COD";
  const status = !online ? "PLACED" : outcome ? "PAYMENT_FAILED" : "PAID";
  const paymentStatus = !online
    ? "NOT_REQUIRED"
    : outcome === "timeout"
      ? "TIMED_OUT"
      : outcome === "fail"
        ? "FAILED"
        : "SUCCEEDED";
  orderSequence += 1;
  return {
    id: randomUUID(),
    number: `MY-1212-${String(1000 + orderSequence).padStart(4, "0")}`,
    status,
    items: stored.items.map(({ sku, quantity, unitPrice, lineTotal }) => ({
      sku,
      quantity,
      unitPrice,
      lineTotal,
    })),
    subtotal: money(subtotal),
    shippingFee: money(fee),
    total: money(subtotal + fee),
    payment: { method: body.paymentMethod, status: paymentStatus },
    createdAt: new Date().toISOString(),
  };
}

async function placeOrder(
  req: IncomingMessage,
  res: ServerResponse,
  email: string,
  scenario: string,
) {
  const key = req.headers["idempotency-key"];
  if (typeof key !== "string" || !/^[0-9a-f-]{36}$/i.test(key)) {
    await readBody(req);
    return problem(res, 400, "IDEMPOTENCY_KEY_MISSING", "Idempotency-Key is required");
  }
  const attempt = (orderAttempts.get(email) ?? 0) + 1;
  orderAttempts.set(email, attempt);
  // The connection drops before any answer; the order is not created.
  if (scenario === "checkout-net-error" && attempt === 1) {
    await readBody(req);
    req.socket.destroy();
    return;
  }
  const { raw, value } = await readJson(req);
  const body = value as Partial<PlaceOrderRequest> | null;
  const outcomeHeader = req.headers["x-mock-payment-outcome"];
  const outcome = typeof outcomeHeader === "string" ? outcomeHeader : undefined;
  const fingerprint = createHash("sha256")
    .update(`${raw}|${outcome ?? ""}`)
    .digest("hex");
  const slot = `${email}:${key}`;
  const known = orders.get(slot);
  if (known) {
    if (known.fingerprint !== fingerprint) {
      return problem(res, 422, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key reused");
    }
    return json(res, 201, known.order, { "idempotent-replayed": "true" });
  }
  const stored = reservationFor(email, body?.reservationId);
  if (!stored) return problem(res, 404, "CHECKOUT_RESERVATION_NOT_FOUND", "Reservation not found");
  const bad = invalidFields(body);
  if (bad.length > 0 || !body?.shippingOptionId || !body.paymentMethod) {
    return problem(res, 400, "VALIDATION_FAILED", "Invalid body", {
      errors: bad.map((field) => ({ field, code: "INVALID" })),
    });
  }
  if (stored.consumed) {
    return problem(res, 410, "CHECKOUT_RESERVATION_CONSUMED", "Reservation already used");
  }
  if (stored.expiresAt <= Date.now()) {
    return problem(res, 410, "CHECKOUT_RESERVATION_EXPIRED", "Reservation expired");
  }
  const order = buildOrder(stored, body as PlaceOrderRequest, outcome);
  stored.consumed = true;
  orders.set(slot, { fingerprint, order });
  orders.set(`order:${order.id}`, { fingerprint, order });
  placedOrders.set(email, [...(placedOrders.get(email) ?? []), order]);
  json(res, 201, order, { "idempotent-replayed": "false" });
}

/** Answers the checkout and order operations and `GET /__stub/orders`; false for other routes. */
export async function handleCheckoutRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: CheckoutContext,
): Promise<boolean> {
  if (url.pathname === "/__stub/orders" && req.method === "GET") {
    const list = placedOrders.get(url.searchParams.get("email") ?? "") ?? [];
    json(res, 200, { count: list.length, orders: list });
    return true;
  }

  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [api, area, sub, id] = parts;
  if (api !== "api") return false;
  const route =
    area === "checkout"
      ? `${req.method} checkout/${sub ?? ""}${id ? "/{id}" : ""}`
      : area === "orders"
        ? `${req.method} orders${sub ? "/{id}" : ""}`
        : "";
  const known = [
    "POST checkout/reservations",
    "GET checkout/reservations/{id}",
    "GET checkout/shipping-options",
    "GET checkout/payment-methods",
    "POST orders",
    "GET orders/{id}",
  ];
  if (!known.includes(route)) return false;

  if (!ctx.token || ctx.token.exp * 1000 <= Date.now()) {
    problem(res, 401, "AUTH_UNAUTHENTICATED", "Authentication required");
    return true;
  }
  const email = ctx.token.email;
  switch (route) {
    case "POST checkout/reservations":
      await createReservation(req, res, email, ctx.scenario);
      break;
    case "GET checkout/reservations/{id}": {
      const stored = reservationFor(email, sub === "reservations" ? id : undefined);
      if (stored) json(res, 200, view(stored));
      else problem(res, 404, "CHECKOUT_RESERVATION_NOT_FOUND", "Reservation not found");
      break;
    }
    case "GET checkout/shipping-options":
      json(res, 200, shippingOptions());
      break;
    case "GET checkout/payment-methods":
      json(res, 200, paymentMethods());
      break;
    case "POST orders":
      await placeOrder(req, res, email, ctx.scenario);
      break;
    default: {
      const found = orders.get(`order:${sub ?? ""}`);
      const mine = found && (placedOrders.get(email) ?? []).some((o) => o.id === found.order.id);
      if (found && mine) json(res, 200, found.order);
      else problem(res, 404, "ORDER_NOT_FOUND", "Order not found");
    }
  }
  return true;
}
