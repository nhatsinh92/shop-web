import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { buildCart, cartFixture } from "@mocks/fixtures/cart";
import { server } from "@mocks/node";
import { clearCartCount, readCartCount, writeCartCount } from "@/lib/hints/cart-count";

import { removeCartItem, updateCartItem } from "./api";
import { mergeGuestCart } from "./merge-guest-cart";
import { cartKeys, cartQueries, setCartCaches } from "./queries";

const SKU = cartFixture.items[0]!.sku;

beforeEach(() => clearCartCount());
afterAll(() => clearCartCount());

describe("cart_count hint write point", () => {
  it("writes the itemCount of a successful summary read", async () => {
    server.use(http.get("*/api/cart/summary", () => HttpResponse.json({ itemCount: 5 })));
    await new QueryClient().fetchQuery(cartQueries.summary());
    expect(document.cookie).toContain("cart_count=5");
  });

  it("writes the itemCount of a successful cart read", async () => {
    await new QueryClient().fetchQuery(cartQueries.mine());
    expect(readCartCount()).toBe(cartFixture.itemCount);
  });

  it("writes the new itemCount after a quantity change", async () => {
    server.use(
      http.patch("*/api/cart/items/:sku", () => HttpResponse.json(buildCart(cartFixture.items))),
    );
    const cart = await updateCartItem(SKU, 2);
    setCartCaches(new QueryClient(), { ...cart, itemCount: 8 });
    expect(readCartCount()).toBe(8);
  });

  it("writes the new itemCount after a remove", async () => {
    server.use(http.delete("*/api/cart/items/:sku", () => HttpResponse.json(buildCart([]))));
    setCartCaches(new QueryClient(), await removeCartItem(SKU));
    expect(readCartCount()).toBe(0);
  });

  it("writes the new itemCount after an add (the refetch that follows it)", async () => {
    writeCartCount(1);
    server.use(http.get("*/api/cart/summary", () => HttpResponse.json({ itemCount: 4 })));
    const client = new QueryClient();
    await client.fetchQuery(cartQueries.summary());
    expect(readCartCount()).toBe(4);
  });

  it("writes the new itemCount after the guest merge", async () => {
    server.use(http.post("*/api/cart/merge", () => HttpResponse.json(buildCart([]))));
    const client = new QueryClient();
    writeCartCount(9);
    await mergeGuestCart(client);
    expect(readCartCount()).toBe(0);
    expect(client.getQueryData(cartKeys.summary())).toEqual({ itemCount: 0 });
  });

  it("keeps the hint when a read fails with 503", async () => {
    writeCartCount(6);
    server.use(http.get("*/api/cart/summary", () => new HttpResponse(null, { status: 503 })));
    await expect(new QueryClient().fetchQuery(cartQueries.summary())).rejects.toBeDefined();
    server.use(http.get("*/api/cart", () => HttpResponse.error()));
    await expect(new QueryClient().fetchQuery(cartQueries.mine())).rejects.toBeDefined();
    expect(readCartCount()).toBe(6);
  });

  it("keeps the hint when a mutation fails", async () => {
    writeCartCount(6);
    server.use(http.post("*/api/cart/merge", () => new HttpResponse(null, { status: 503 })));
    await expect(mergeGuestCart(new QueryClient())).rejects.toBeDefined();
    expect(readCartCount()).toBe(6);
  });
});
