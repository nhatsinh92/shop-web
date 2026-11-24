import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";

import { cartFixture } from "@mocks/fixtures/cart";
import { cartOverrides } from "@mocks/cart-handlers";
import { server } from "@mocks/node";

import { cartKeys } from "./queries";
import { mergeGuestCart } from "./merge-guest-cart";

describe("mergeGuestCart", () => {
  it("sets cartKeys.mine() and cartKeys.summary() from the merge response", async () => {
    const client = new QueryClient();
    await mergeGuestCart(client);
    expect(client.getQueryData(cartKeys.mine())).toBeDefined();
    expect(client.getQueryData(cartKeys.summary())).toEqual({
      itemCount: (client.getQueryData(cartKeys.mine()) as { itemCount: number }).itemCount,
    });
  });

  it("calls POST /api/cart/merge", async () => {
    let method = "";
    server.use(
      http.post("*/api/cart/merge", ({ request }) => {
        method = request.method;
        return HttpResponse.json(cartFixture);
      }),
    );
    await mergeGuestCart(new QueryClient());
    expect(method).toBe("POST");
  });

  it("rejects and leaves the caches untouched when the merge is unavailable", async () => {
    server.use(cartOverrides.mergeUnavailable);
    const client = new QueryClient();
    await expect(mergeGuestCart(client)).rejects.toBeDefined();
    expect(client.getQueryData(cartKeys.mine())).toBeUndefined();
  });

  it("aborts a merge slower than the 1 s budget", async () => {
    server.use(cartOverrides.mergeDelayed(3000));
    const client = new QueryClient();
    const started = Date.now();
    await expect(mergeGuestCart(client)).rejects.toBeDefined();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(1500);
    expect(client.getQueryData(cartKeys.mine())).toBeUndefined();
  });
});
