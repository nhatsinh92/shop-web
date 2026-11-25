import { http, HttpResponse } from "msw";

import { server } from "@mocks/node";
import { checkoutOverrides } from "@mocks/checkout-handlers";
import { ApiError } from "@/lib/api";

import {
  createCheckoutReservation,
  getCheckoutReservation,
  getOrder,
  listPaymentMethods,
  listShippingOptions,
  placeOrder,
} from "./api";

import type { PlaceOrderInput } from "./api";

const address = {
  fullName: "Nguyễn Văn A",
  phone: "0901234567",
  line1: "12 Lê Lợi",
  ward: "Bến Nghé",
  province: "TP. Hồ Chí Minh",
};
const KEY = crypto.randomUUID();

async function reserve() {
  return createCheckoutReservation({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] });
}

function orderInput(reservationId: string): PlaceOrderInput {
  return {
    reservationId,
    shippingOptionId: "STANDARD",
    paymentMethod: "COD",
    shippingAddress: address,
  };
}

describe("checkout api", () => {
  it("creates and reads a reservation", async () => {
    const created = await reserve();
    expect(created.status).toBe("ACTIVE");
    expect(await getCheckoutReservation(created.id)).toEqual(created);
  });

  it("surfaces a 409 out of stock as ApiError", async () => {
    server.use(checkoutOverrides.reservationOutOfStock);
    await expect(reserve()).rejects.toMatchObject({ status: 409, code: "CHECKOUT_OUT_OF_STOCK" });
    await expect(reserve()).rejects.toBeInstanceOf(ApiError);
  });

  it("lists shipping options with and without a reservation id", async () => {
    const queries: Array<string | null> = [];
    server.use(
      http.get("*/api/checkout/shipping-options", ({ request }) => {
        queries.push(new URL(request.url).searchParams.get("reservationId"));
        return HttpResponse.json({ items: [] });
      }),
    );
    await listShippingOptions("r1");
    await listShippingOptions();
    expect(queries).toEqual(["r1", null]);
    server.resetHandlers();
    expect((await listShippingOptions()).items.length).toBeGreaterThan(0);
  });

  it("lists payment methods", async () => {
    expect((await listPaymentMethods()).items.map((m) => m.id)).toContain("COD");
  });

  it("places an order with the idempotency key and reads it back", async () => {
    const reservation = await reserve();
    const order = await placeOrder(orderInput(reservation.id), { idempotencyKey: KEY });
    expect(order.status).toBe("PLACED");
    expect(await getOrder(order.id)).toEqual(order);
  });

  it("sends Idempotency-Key and X-Mock-Payment-Outcome only when given", async () => {
    const seen: Array<[string | null, string | null]> = [];
    server.use(
      http.post("*/api/orders", ({ request }) => {
        seen.push([
          request.headers.get("idempotency-key"),
          request.headers.get("x-mock-payment-outcome"),
        ]);
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    const input = orderInput("r1");
    await placeOrder(input, { idempotencyKey: KEY });
    await placeOrder(input, { idempotencyKey: KEY, mockOutcome: "fail" });
    expect(seen).toEqual([
      [KEY, null],
      [KEY, "fail"],
    ]);
  });

  it("passes the AbortSignal to placeOrder", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      placeOrder(orderInput("r1"), { idempotencyKey: KEY, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("answers ApiError 404 for an unknown order", async () => {
    await expect(getOrder("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      status: 404,
    });
  });
});
