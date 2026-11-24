import { describe, expect, it } from "vitest";

import { cartState } from "./cart-state";
import { cartOverrides } from "./cart-handlers";
import { buildCart, cartFixture, cartLine, emptyCartFixture } from "./fixtures/cart";
import { server } from "./node";

const url = (path: string) => `http://localhost${path}`;
const json = { "content-type": "application/json" };
const patch = (sku: string, quantity: number) =>
  fetch(url(`/api/cart/items/${sku}`), {
    method: "PATCH",
    headers: json,
    body: JSON.stringify({ quantity }),
  });
const add = (sku: string, quantity: number) =>
  fetch(url("/api/cart/items"), {
    method: "POST",
    headers: json,
    body: JSON.stringify({ sku, quantity }),
  });
const merge = () => fetch(url("/api/cart/merge"), { method: "POST" });
const getCart = () => fetch(url("/api/cart"));

describe("cart fixture", () => {
  it("has the artboard lines with consistent totals", () => {
    expect(
      cartFixture.items.map((i) => [i.sku, i.quantity, i.unitPrice.amount, i.stockLevel]),
    ).toEqual([
      ["SKU-ANC-PRO-BLK", 1, 890_000, "LOW"],
      ["SKU-KB-75", 1, 1_150_000, "IN_STOCK"],
      ["SKU-BOTTLE-750", 2, 189_000, "IN_STOCK"],
    ]);
    expect(cartFixture.items.map((i) => i.listPrice?.amount)).toEqual([
      1_790_000, 1_690_000, 320_000,
    ]);
    expect(cartFixture.items[0]?.variantLabel).toBe("Màu: Đen nhám");
    expect(cartFixture.items[2]?.variantLabel).toBe("Màu: Xanh rêu");
    for (const item of cartFixture.items) {
      expect(item.lineTotal.amount).toBe(item.unitPrice.amount * item.quantity);
    }
    expect(cartFixture.itemCount).toBe(4);
    expect(cartFixture.subtotal.amount).toBe(890_000 + 1_150_000 + 2 * 189_000);
  });
});

describe("default cart handlers", () => {
  it("GET /api/cart answers the seeded cart", async () => {
    const res = await getCart();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cartFixture);
  });

  it("PATCH sets the absolute quantity and recomputes totals", async () => {
    const res = await patch("SKU-BOTTLE-750", 5);
    const cart = await res.json();
    expect(res.status).toBe(200);
    expect(cart.itemCount).toBe(7);
    expect(cart.items[2].lineTotal.amount).toBe(5 * 189_000);
    expect(cart.subtotal.amount).toBe(890_000 + 1_150_000 + 5 * 189_000);
  });

  it.each([0, 11])("PATCH quantity %i answers 422 CART_QTY_LIMIT", async (quantity) => {
    const res = await patch("SKU-KB-75", quantity);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "CART_QTY_LIMIT" });
  });

  it("PATCH unknown SKU answers 404 CART_ITEM_NOT_FOUND", async () => {
    const res = await patch("SKU-NOPE", 2);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "CART_ITEM_NOT_FOUND" });
  });

  it("DELETE removes the line and returns the cart", async () => {
    const res = await fetch(url("/api/cart/items/SKU-KB-75"), { method: "DELETE" });
    const cart = await res.json();
    expect(res.status).toBe(200);
    expect(cart.items.map((i: { sku: string }) => i.sku)).toEqual([
      "SKU-ANC-PRO-BLK",
      "SKU-BOTTLE-750",
    ]);
    expect(cart.itemCount).toBe(3);
  });

  it("DELETE unknown SKU answers 404 CART_ITEM_NOT_FOUND", async () => {
    const res = await fetch(url("/api/cart/items/SKU-NOPE"), { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "CART_ITEM_NOT_FOUND" });
  });

  it("merge returns the cart", async () => {
    const res = await merge();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(cartFixture);
  });

  it("keeps the summary and add defaults that existing tests assert", async () => {
    expect(await (await fetch(url("/api/cart/summary"))).json()).toEqual({ itemCount: 3 });
    expect(await (await add("SKU-1", 2)).json()).toMatchObject({ itemCount: 5 });
  });

  it("resets the in-memory cart after each test (mutation)", async () => {
    await patch("SKU-KB-75", 9);
    expect(cartState.get().itemCount).toBe(12);
  });

  it("resets the in-memory cart after each test (fresh)", () => {
    expect(cartState.get().itemCount).toBe(4);
  });
});

describe("cartOverrides.statefulCart", () => {
  it("makes summary and add agree with GET /api/cart", async () => {
    server.use(...cartOverrides.statefulCart());
    expect(await (await fetch(url("/api/cart/summary"))).json()).toEqual({ itemCount: 4 });
    const added = await (await add("SKU-MOUSE-SIL", 2)).json();
    expect(added.itemCount).toBe(6);
    expect(added.items.at(-1)).toMatchObject({ sku: "SKU-MOUSE-SIL", quantity: 2 });
    expect(await (await fetch(url("/api/cart/summary"))).json()).toEqual({ itemCount: 6 });
    expect((await (await getCart()).json()).itemCount).toBe(6);
  });

  it("adds to an existing line and caps it at 10", async () => {
    server.use(...cartOverrides.statefulCart());
    const cart = await (await add("SKU-BOTTLE-750", 20)).json();
    expect(cart.items[2].quantity).toBe(10);
  });

  it("answers 404 PRODUCT_NOT_FOUND for an unknown SKU", async () => {
    server.use(...cartOverrides.statefulCart());
    const res = await add("SKU-NOPE", 1);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "PRODUCT_NOT_FOUND" });
  });

  it("answers 422 CART_ITEMS_LIMIT with limit 50 for a 51st distinct SKU", async () => {
    server.use(...cartOverrides.statefulCart());
    const lines = Array.from({ length: 50 }, (_, i) =>
      cartLine({
        sku: `SKU-FILL-${i}`,
        slug: `fill-${i}`,
        name: `Fill ${i}`,
        imageUrl: "https://placehold.co/800x800",
        unitPrice: 1000,
        quantity: 1,
        available: true,
      }),
    );
    cartState.set(lines);
    const res = await add("SKU-MOUSE-SIL", 1);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "CART_ITEMS_LIMIT", limit: 50 });
    expect(buildCart(lines).itemCount).toBe(50);
  });
});

describe("cart overrides", () => {
  it("slowCart delays GET /api/cart", async () => {
    server.use(cartOverrides.slowCart(60));
    const start = Date.now();
    const res = await getCart();
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
    expect(res.status).toBe(200);
  });

  it("cartUnavailable answers 503 SERVICE_UNAVAILABLE", async () => {
    server.use(cartOverrides.cartUnavailable);
    const res = await getCart();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("emptyCart answers no items and zero totals", async () => {
    server.use(cartOverrides.emptyCart);
    expect(await (await getCart()).json()).toEqual(emptyCartFixture);
    expect(emptyCartFixture).toMatchObject({ items: [], itemCount: 0, subtotal: { amount: 0 } });
  });

  it("patchQtyLimit answers 422 CART_QTY_LIMIT", async () => {
    server.use(cartOverrides.patchQtyLimit);
    const res = await patch("SKU-KB-75", 2);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "CART_QTY_LIMIT", limit: 10 });
  });

  it("patchUnavailable answers 503 SERVICE_UNAVAILABLE", async () => {
    server.use(cartOverrides.patchUnavailable);
    const res = await patch("SKU-KB-75", 2);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("patchDelayed answers late with the state at request time", async () => {
    server.use(cartOverrides.patchDelayed(60));
    const slow = patch("SKU-KB-75", 3);
    const start = Date.now();
    const res = await slow;
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
    expect((await res.json()).items[1].quantity).toBe(3);
  });

  it("mergeUnavailable answers 503 SERVICE_UNAVAILABLE", async () => {
    server.use(cartOverrides.mergeUnavailable);
    const res = await merge();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("mergeDelayed delays the merge", async () => {
    server.use(cartOverrides.mergeDelayed(60));
    const start = Date.now();
    const res = await merge();
    expect(Date.now() - start).toBeGreaterThanOrEqual(50);
    expect(res.status).toBe(200);
  });

  it("cartUnauthenticatedOnce answers 401 to the first write, then succeeds", async () => {
    server.use(...cartOverrides.cartUnauthenticatedOnce());
    const first = await patch("SKU-KB-75", 4);
    expect(first.status).toBe(401);
    expect(await first.json()).toMatchObject({ code: "AUTH_UNAUTHENTICATED" });
    const second = await patch("SKU-KB-75", 4);
    expect(second.status).toBe(200);
    expect((await second.json()).items[1].quantity).toBe(4);
  });
});
