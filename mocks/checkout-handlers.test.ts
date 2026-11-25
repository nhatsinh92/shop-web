import { describe, expect, it } from "vitest";

import { checkoutState } from "./checkout-handlers";
import { orderFixture, paymentMethodFixtures, shippingOptionFixtures } from "./fixtures/checkout";

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

describe("fixtures", () => {
  it("has standard (free) and express shipping, COD available, and the artboard order number", () => {
    expect(shippingOptionFixtures.map((o) => o.id)).toEqual(["STANDARD", "EXPRESS_2H"]);
    expect(shippingOptionFixtures.some((o) => o.fee.amount === 0)).toBe(true);
    expect(shippingOptionFixtures.every((o) => o.estimatedDelivery.length > 0)).toBe(true);
    const methods = paymentMethodFixtures();
    expect(methods.map((m) => m.id)).toEqual(["COD", "EWALLET", "CARD"]);
    expect(methods.find((m) => m.id === "COD")?.available).toBe(true);
    expect(orderFixture.number).toBe("MY-1212-0087");
  });
});

describe("reservations", () => {
  it("creates an ACTIVE reservation from the request lines with consistent totals", async () => {
    const before = Date.now();
    const res = await reserve();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("ACTIVE");
    const [first, second] = body.items;
    expect(first).toMatchObject({
      sku: "SKU-ANC-PRO-BLK",
      variantLabel: "Màu: Đen nhám",
      priceChanged: false,
      unitPrice: { amount: 890_000 },
    });
    expect(first.name).toBeTruthy();
    expect(first.imageUrl).toBeTruthy();
    expect(second).toMatchObject({ sku: "SKU-BOTTLE-750", priceChanged: false });
    for (const item of body.items) {
      expect(item.lineTotal.amount).toBe(item.unitPrice.amount * item.quantity);
    }
    expect(body.subtotal.amount).toBe(
      body.items.reduce(
        (sum: number, item: { lineTotal: { amount: number } }) => sum + item.lineTotal.amount,
        0,
      ),
    );
    const expiresIn = Date.parse(body.expiresAt) - before;
    expect(expiresIn).toBeGreaterThanOrEqual(10 * 60 * 1000 - 50);
    expect(expiresIn).toBeLessThanOrEqual(10 * 60 * 1000 + 5_000);
  });

  it("sets priceChanged only when expectedUnitPrice differs from the current price", async () => {
    const res = await reserve([
      { sku: "SKU-KB-75", quantity: 1, expectedUnitPrice: { amount: 1_690_000, currency: "VND" } },
      {
        sku: "SKU-BOTTLE-750",
        quantity: 1,
        expectedUnitPrice: { amount: 189_000, currency: "VND" },
      },
      { sku: "SKU-ANC-PRO-BLK", quantity: 1 },
    ]);
    const body = await res.json();
    expect(body.items.map((i: { priceChanged: boolean }) => i.priceChanged)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("answers 400 VALIDATION_FAILED for an unknown SKU or no lines", async () => {
    for (const items of [[{ sku: "NOPE", quantity: 1 }], []]) {
      const res = await reserve(items);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "VALIDATION_FAILED" });
    }
  });

  it("releases the previous active reservation when a new one is created", async () => {
    const first = await (await reserve()).json();
    const second = await (await reserve()).json();
    const read = async (id: string) =>
      (await (await fetch(`${base}/checkout/reservations/${id}`)).json()).status;
    expect(await read(first.id)).toBe("RELEASED");
    expect(await read(second.id)).toBe("ACTIVE");
  });

  it("returns the stored reservation and 404 CHECKOUT_RESERVATION_NOT_FOUND for an unknown id", async () => {
    const created = await (await reserve()).json();
    const found = await fetch(`${base}/checkout/reservations/${created.id}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(created);
    const missing = await fetch(
      `${base}/checkout/reservations/00000000-0000-4000-8000-000000000000`,
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "CHECKOUT_RESERVATION_NOT_FOUND" });
  });

  it("reports EXPIRED after expiresAt", async () => {
    const created = await (await reserve()).json();
    const realNow = Date.now;
    Date.now = () => realNow() + 10 * 60 * 1000 + 1;
    try {
      const res = await fetch(`${base}/checkout/reservations/${created.id}`);
      expect((await res.json()).status).toBe("EXPIRED");
    } finally {
      Date.now = realNow;
    }
  });

  it("returns the shipping options and payment methods fixtures", async () => {
    const created = await (await reserve()).json();
    const shipping = await fetch(`${base}/checkout/shipping-options?reservationId=${created.id}`);
    expect(await shipping.json()).toEqual({ items: shippingOptionFixtures });
    const unknown = await fetch(
      `${base}/checkout/shipping-options?reservationId=00000000-0000-4000-8000-000000000000`,
    );
    expect(unknown.status).toBe(404);
    const payment = await fetch(`${base}/checkout/payment-methods`);
    expect(await payment.json()).toEqual({ items: paymentMethodFixtures() });
  });
});

describe("state reset between tests", () => {
  let leaked = "";

  it("stores a reservation and an order", async () => {
    const created = await (await reserve()).json();
    leaked = created.id;
    await placeOrder(created.id);
    expect(checkoutState.orderCount()).toBe(1);
  });

  it("has neither the reservation nor the order of the previous test", async () => {
    expect(leaked).not.toBe("");
    const res = await fetch(`${base}/checkout/reservations/${leaked}`);
    expect(res.status).toBe(404);
    expect(checkoutState.orderCount()).toBe(0);
  });
});

describe("placeOrder", () => {
  it("answers 400 IDEMPOTENCY_KEY_MISSING without the header", async () => {
    const { id } = await (await reserve()).json();
    const res = await placeOrder(id, { key: null });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_MISSING" });
  });

  it("places a COD order as PLACED with the artboard order number and consumes the reservation", async () => {
    const { id } = await (await reserve()).json();
    const res = await placeOrder(id);
    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order).toMatchObject({
      number: "MY-1212-0087",
      status: "PLACED",
      payment: { method: "COD", status: "NOT_REQUIRED" },
      shippingFee: { amount: 0 },
    });
    expect(order.total.amount).toBe(order.subtotal.amount + order.shippingFee.amount);
    expect(res.headers.get("Idempotent-Replayed")).toBe("false");
    expect(checkoutState.reservation(id)?.status).toBe("CONSUMED");
  });

  it("replays the stored response for the same key and body, with no second order", async () => {
    const { id } = await (await reserve()).json();
    const first = await placeOrder(id);
    const replay = await placeOrder(id);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await replay.json()).toEqual(await first.json());
    expect(checkoutState.orderCount()).toBe(1);
  });

  it("answers 422 IDEMPOTENCY_KEY_REUSED for the same key and another body", async () => {
    const { id } = await (await reserve()).json();
    await placeOrder(id);
    const res = await placeOrder(id, { paymentMethod: "EWALLET" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(checkoutState.orderCount()).toBe(1);
  });

  it("answers 410 CHECKOUT_RESERVATION_CONSUMED for a new key on a consumed reservation", async () => {
    const { id } = await (await reserve()).json();
    await placeOrder(id);
    const res = await placeOrder(id, { key: "22222222-2222-4222-8222-222222222222" });
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: "CHECKOUT_RESERVATION_CONSUMED" });
  });

  it("answers 410 CHECKOUT_RESERVATION_EXPIRED for a released reservation", async () => {
    const released = await (await reserve()).json();
    await reserve();
    const res = await placeOrder(released.id);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: "CHECKOUT_RESERVATION_EXPIRED" });
  });

  it("answers 404 CHECKOUT_RESERVATION_NOT_FOUND for an unknown reservation", async () => {
    const res = await placeOrder("00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "CHECKOUT_RESERVATION_NOT_FOUND" });
  });

  it("answers 400 VALIDATION_FAILED with a shippingAddress.phone error for an invalid phone", async () => {
    const { id } = await (await reserve()).json();
    const res = await placeOrder(id, { phone: "12" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.errors).toEqual([expect.objectContaining({ field: "shippingAddress.phone" })]);
    expect(checkoutState.orderCount()).toBe(0);
  });

  it("answers 400 for a blank required address field", async () => {
    const { id } = await (await reserve()).json();
    const res = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "33333333-3333-4333-8333-333333333333" },
      body: JSON.stringify({
        reservationId: id,
        shippingOptionId: "STANDARD",
        paymentMethod: "COD",
        shippingAddress: { ...address, ward: " " },
      }),
    });
    expect((await res.json()).errors[0].field).toBe("shippingAddress.ward");
  });

  it("pays online orders (PAID) and charges express shipping", async () => {
    const { id } = await (await reserve()).json();
    const res = await fetch(`${base}/orders`, {
      method: "POST",
      headers: { ...json, "Idempotency-Key": "44444444-4444-4444-8444-444444444444" },
      body: JSON.stringify({
        reservationId: id,
        shippingOptionId: "EXPRESS_2H",
        paymentMethod: "EWALLET",
        shippingAddress: address,
      }),
    });
    const order = await res.json();
    expect(order).toMatchObject({
      status: "PAID",
      payment: { status: "SUCCEEDED" },
      shippingFee: { amount: 35_000 },
    });
  });

  it.each([
    ["fail", "FAILED"],
    ["timeout", "TIMED_OUT"],
  ] as const)(
    "answers 201 PAYMENT_FAILED / %s for X-Mock-Payment-Outcome: %s",
    async (outcome, status) => {
      const { id } = await (await reserve()).json();
      const res = await placeOrder(id, { paymentMethod: "CARD", outcome });
      expect(res.status).toBe(201);
      expect(await res.json()).toMatchObject({ status: "PAYMENT_FAILED", payment: { status } });
    },
  );

  it("ignores the outcome header for COD", async () => {
    const { id } = await (await reserve()).json();
    const res = await placeOrder(id, { outcome: "fail" });
    expect((await res.json()).status).toBe("PLACED");
  });
});

describe("getOrder", () => {
  it("returns a placed order and 404 ORDER_NOT_FOUND otherwise", async () => {
    const { id } = await (await reserve()).json();
    const order = await (await placeOrder(id)).json();
    const found = await fetch(`${base}/orders/${order.id}`);
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(order);
    const missing = await fetch(`${base}/orders/00000000-0000-4000-8000-000000000000`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "ORDER_NOT_FOUND" });
  });
});
