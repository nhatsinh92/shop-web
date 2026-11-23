import { describe, expect, it } from "vitest";

import { cartOverrides } from "./cart-handlers";
import { server } from "./node";

const post = () =>
  fetch("http://localhost/api/cart/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sku: "SKU-1", quantity: 2 }),
  });

describe("cart handlers", () => {
  it("adds an item by default", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ itemCount: 5 });
  });

  it.each([
    ["addOutOfStock", 409, "CART_OUT_OF_STOCK"],
    ["addQtyLimit", 422, "CART_QTY_LIMIT"],
    ["addUnavailable", 503, "SERVICE_UNAVAILABLE"],
  ] as const)("%s answers %i %s", async (name, status, code) => {
    server.use(cartOverrides[name]);
    const res = await post();
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ code });
  });
});
