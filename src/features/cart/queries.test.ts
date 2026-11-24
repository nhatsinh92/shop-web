import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { cartFixture } from "@mocks/fixtures/cart";
import { cartOverrides } from "@mocks/cart-handlers";
import { server } from "@mocks/node";
import { PERSISTED_CACHE_BUSTER, persistOptions } from "@/lib/query/persister";

import { postCartMerge, removeCartItem, updateCartItem, getCart } from "./api";
import { cartKeys, cartQueries, setCartCaches } from "./queries";

describe("cart query keys and options", () => {
  it("cartKeys.mine() is [cart, mine] and the summary key is unchanged", () => {
    expect(cartKeys.mine()).toEqual(["cart", "mine"]);
    expect(cartKeys.summary()).toEqual(["cart", "summary"]);
    expect(cartKeys.mine().slice(0, 1)).toEqual(cartKeys.all);
    expect(cartKeys.summary().slice(0, 1)).toEqual(cartKeys.all);
  });

  it("cartQueries.mine() is fresh-always, retries once and persists", async () => {
    const options = cartQueries.mine();
    expect(options.staleTime).toBe(0);
    expect(options.retry).toBe(1);
    expect(options.meta).toEqual({ persist: true });
    expect(PERSISTED_CACHE_BUSTER).toBe("v1");

    const client = new QueryClient();
    let signal: AbortSignal | undefined;
    server.use(
      http.get("*/api/cart", ({ request }) => {
        signal = request.signal;
        return HttpResponse.json(cartFixture);
      }),
    );
    const data = await client.fetchQuery(options);
    expect(data.itemCount).toBe(cartFixture.itemCount);
    expect(signal).toBeDefined();
    const query = client.getQueryCache().find({ queryKey: cartKeys.mine() })!;
    expect(persistOptions.dehydrateOptions?.shouldDehydrateQuery?.(query)).toBe(true);
  });
});

describe("cart browser calls", () => {
  it("getCart returns the cart", async () => {
    expect((await getCart()).items).toHaveLength(cartFixture.items.length);
  });

  it("updateCartItem sends the absolute quantity", async () => {
    const sku = cartFixture.items[0]!.sku;
    const cart = await updateCartItem(sku, 4);
    expect(cart.items.find((i) => i.sku === sku)?.quantity).toBe(4);
  });

  it("removeCartItem removes the line", async () => {
    const sku = cartFixture.items[0]!.sku;
    const cart = await removeCartItem(sku);
    expect(cart.items.some((i) => i.sku === sku)).toBe(false);
  });

  it("postCartMerge returns the merged cart", async () => {
    expect((await postCartMerge()).items.length).toBeGreaterThan(0);
  });

  it("throws ApiError on a problem response", async () => {
    await expect(updateCartItem("NOPE", 1)).rejects.toMatchObject({ status: 404 });
    await expect(updateCartItem(cartFixture.items[0]!.sku, 99)).rejects.toMatchObject({
      code: "CART_QTY_LIMIT",
    });
  });

  it("a cart write after a 401 refreshes once and retries once", async () => {
    server.use(...cartOverrides.cartUnauthenticatedOnce());
    let refreshes = 0;
    server.use(
      http.post("*/api/auth/refresh", () => {
        refreshes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const sku = cartFixture.items[0]!.sku;
    const cart = await updateCartItem(sku, 3);
    expect(refreshes).toBe(1);
    expect(cart.items.find((i) => i.sku === sku)?.quantity).toBe(3);
  });
});

describe("setCartCaches", () => {
  it("sets the full cart and the summary", () => {
    const client = new QueryClient();
    setCartCaches(client, cartFixture);
    expect(client.getQueryData(cartKeys.mine())).toEqual(cartFixture);
    expect(client.getQueryData(cartKeys.summary())).toEqual({ itemCount: cartFixture.itemCount });
  });
});
