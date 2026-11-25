import { QueryClient } from "@tanstack/react-query";

import { checkoutKeys, checkoutQueries, orderKeys, orderQueries } from "./queries";

describe("checkout query keys and options", () => {
  it("builds the keys", () => {
    expect(checkoutKeys.reservation("r1")).toEqual(["checkout", "reservation", "r1"]);
    expect(checkoutKeys.shippingOptions("r1")).toEqual(["checkout", "shipping-options", "r1"]);
    expect(checkoutKeys.paymentMethods()).toEqual(["checkout", "payment-methods"]);
    expect(orderKeys.detail("o1")).toEqual(["order", "detail", "o1"]);
  });

  it("every factory has staleTime 0 and no meta.persist", () => {
    const all = [
      checkoutQueries.reservation("r1"),
      checkoutQueries.shippingOptions("r1"),
      checkoutQueries.paymentMethods(),
      orderQueries.detail("o1"),
    ];
    for (const options of all) {
      expect(options.staleTime).toBe(0);
      expect(options.meta?.persist).toBeUndefined();
    }
    expect(new QueryClient().getQueryCache().getAll()).toEqual([]);
  });
});
