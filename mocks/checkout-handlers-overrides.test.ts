import { describe, expect, it } from "vitest";

import { checkoutOverrides } from "./checkout-handlers";
import { server } from "./node";

const base = "http://localhost/api";
const json = { "content-type": "application/json" };

const lines = [
  { sku: "SKU-ANC-PRO-BLK", quantity: 1, expectedUnitPrice: { amount: 890_000, currency: "VND" } },
  { sku: "SKU-BOTTLE-750", quantity: 2 },
];

const reserve = (items: unknown = lines) =>
  fetch(`${base}/checkout/reservations`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ items }),
  });

const address = {
  fullName: "Nguyễn Văn A",
  phone: "0912345678",
  line1: "12 Lê Lợi",
  ward: "Bến Nghé",
  province: "TP. Hồ Chí Minh",
};

const placeOrder = (
  reservationId: string,
  init: { key?: string | null; paymentMethod?: string; outcome?: string; phone?: string } = {},
) => {
  const headers: Record<string, string> = { ...json };
  if (init.key !== null)
    headers["Idempotency-Key"] = init.key ?? "11111111-1111-4111-8111-111111111111";
  if (init.outcome) headers["X-Mock-Payment-Outcome"] = init.outcome;
  return fetch(`${base}/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      reservationId,
      shippingOptionId: "STANDARD",
      paymentMethod: init.paymentMethod ?? "COD",
      shippingAddress: { ...address, phone: init.phone ?? address.phone },
    }),
  });
};

describe("checkoutOverrides", () => {
  it("reservationOutOfStock answers 409 CHECKOUT_OUT_OF_STOCK with per-line available", async () => {
    server.use(checkoutOverrides.reservationOutOfStock);
    const res = await reserve([{ sku: "SKU-BOTTLE-750", quantity: 2 }]);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "CHECKOUT_OUT_OF_STOCK",
      unavailable: [{ sku: "SKU-BOTTLE-750", requested: 2, available: 1 }],
    });
  });

  it("reservationExpiresIn(ms) sets expiresAt and expires the hold", async () => {
    server.use(checkoutOverrides.reservationExpiresIn(0));
    const created = await (await reserve()).json();
    const read = await fetch(`${base}/checkout/reservations/${created.id}`);
    expect((await read.json()).status).toBe("EXPIRED");
    const res = await placeOrder(created.id);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: "CHECKOUT_RESERVATION_EXPIRED" });
  });

  it("slowCheckout(ms) delays the three reads", async () => {
    const created = await (await reserve()).json();
    server.use(...checkoutOverrides.slowCheckout(60));
    for (const path of [
      `/checkout/reservations/${created.id}`,
      "/checkout/shipping-options",
      "/checkout/payment-methods",
    ]) {
      const started = performance.now();
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect(performance.now() - started).toBeGreaterThanOrEqual(50);
    }
  });

  it("checkoutUnavailable answers 503 SERVICE_UNAVAILABLE on every operation", async () => {
    server.use(...checkoutOverrides.checkoutUnavailable);
    const id = "00000000-0000-4000-8000-000000000000";
    const responses = await Promise.all([
      reserve(),
      fetch(`${base}/checkout/reservations/${id}`),
      fetch(`${base}/checkout/shipping-options`),
      fetch(`${base}/checkout/payment-methods`),
      placeOrder(id),
      fetch(`${base}/orders/${id}`),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    }
  });

  it("orderInProgress(times) answers 409 IDEMPOTENCY_IN_PROGRESS the first times calls", async () => {
    const { id } = await (await reserve()).json();
    server.use(checkoutOverrides.orderInProgress(2));
    for (let i = 0; i < 2; i += 1) {
      const res = await placeOrder(id);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });
    }
    expect((await placeOrder(id)).status).toBe(201);
  });

  it("orderPendingPayment(polls) answers PENDING_PAYMENT, then PAID after polls reads", async () => {
    const { id } = await (await reserve()).json();
    server.use(...checkoutOverrides.orderPendingPayment(2));
    const placed = await placeOrder(id, { paymentMethod: "EWALLET" });
    expect(placed.status).toBe(201);
    const order = await placed.json();
    expect(order).toMatchObject({ status: "PENDING_PAYMENT", payment: { status: "PENDING" } });
    const statuses: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      statuses.push((await (await fetch(`${base}/orders/${order.id}`)).json()).status);
    }
    expect(statuses).toEqual(["PENDING_PAYMENT", "PENDING_PAYMENT", "PAID", "PAID"]);
  });

  it("orderPendingPayment leaves COD as PLACED", async () => {
    const { id } = await (await reserve()).json();
    server.use(...checkoutOverrides.orderPendingPayment(1));
    expect((await (await placeOrder(id)).json()).status).toBe("PLACED");
  });

  it("cardUnavailable marks the card unavailable and rejects it with 422", async () => {
    server.use(...checkoutOverrides.cardUnavailable);
    const methods = await (await fetch(`${base}/checkout/payment-methods`)).json();
    expect(methods.items.find((m: { id: string }) => m.id === "CARD").available).toBe(false);
    const { id } = await (await reserve()).json();
    const res = await placeOrder(id, { paymentMethod: "CARD" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "CHECKOUT_PAYMENT_METHOD_UNAVAILABLE" });
    expect((await placeOrder(id, { key: "55555555-5555-4555-8555-555555555555" })).status).toBe(
      201,
    );
  });
});
