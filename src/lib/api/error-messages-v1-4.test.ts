import { describe, expect, it } from "vitest";

import { ApiError } from "./api-error";
import { GENERIC_ERROR_MESSAGE, messageFor } from "./error-messages";
import type { components } from "./generated/core";

type ShippingAddress = components["schemas"]["ShippingAddress"];
type Order = components["schemas"]["Order"];

const fail = (code: string) => new ApiError({ status: 409, code, detail: "x" });

describe("error messages for contract 1.4.0", () => {
  it("maps CHECKOUT_RESERVATION_CONSUMED to the already placed message", () => {
    expect(messageFor(fail("CHECKOUT_RESERVATION_CONSUMED"))).toBe("Đơn hàng này đã được đặt");
  });

  it("maps CHECKOUT_PAYMENT_METHOD_UNAVAILABLE to the unavailable message", () => {
    expect(messageFor(fail("CHECKOUT_PAYMENT_METHOD_UNAVAILABLE"))).toBe(
      "Phương thức thanh toán tạm thời không khả dụng",
    );
  });

  it.each([
    "CHECKOUT_OUT_OF_STOCK",
    "CHECKOUT_RESERVATION_NOT_FOUND",
    "CHECKOUT_RESERVATION_EXPIRED",
    "CHECKOUT_RESERVATION_CONSUMED",
    "CHECKOUT_PAYMENT_METHOD_UNAVAILABLE",
    "ORDER_NOT_FOUND",
    "IDEMPOTENCY_KEY_MISSING",
    "IDEMPOTENCY_KEY_REUSED",
    "IDEMPOTENCY_IN_PROGRESS",
    "RATE_LIMITED",
    "SERVICE_UNAVAILABLE",
  ])("has a specific Vietnamese message for %s", (code) => {
    const message = messageFor(fail(code));
    expect(message).not.toBe("");
    expect(message).not.toBe(messageFor(fail("UNKNOWN_ERROR")));
    expect(message).not.toBe(GENERIC_ERROR_MESSAGE);
  });

  it("generated types: ShippingAddress.district is optional and Order.number exists", () => {
    // Compile-time checks (tsc in make lint): omitting district must type-check.
    const address: ShippingAddress = { ...({} as ShippingAddress) };
    delete address.district;
    const orderNumber: Order["number"] = "MY-1212-0087";
    expect(address.district).toBeUndefined();
    expect(orderNumber).toBe("MY-1212-0087");
  });
});
