import { http, HttpResponse } from "msw";

import { cartFixture } from "@mocks/fixtures/cart";
import { cartOverrides } from "@mocks/cart-handlers";
import { server } from "@mocks/node";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));

import { getCartForRequest } from "./cart.server";

function cookies(values: Record<string, string>) {
  cookieGet.mockImplementation((name: string) =>
    name in values ? { name, value: values[name] } : undefined,
  );
}

describe("getCartForRequest", () => {
  beforeEach(() => cookieGet.mockReset());

  it("returns an empty cart without calling the backend when there is no cookie", async () => {
    cookies({ logged_in: "1" });
    let calls = 0;
    server.use(
      http.get("*/api/cart", () => {
        calls += 1;
        return HttpResponse.json(cartFixture);
      }),
    );
    const cart = await getCartForRequest();
    expect(cart).toMatchObject({ items: [], itemCount: 0 });
    expect(calls).toBe(0);
  });

  it("sends the bearer token and the guest_cart cookie only", async () => {
    cookies({ access_token: "tok-1", guest_cart: "abcdefghijklmnopqrstuv", logged_in: "1" });
    const seen: Array<string | null> = [];
    server.use(
      http.get("*/api/cart", ({ request }) => {
        seen.push(request.headers.get("authorization"), request.headers.get("cookie"));
        return HttpResponse.json(cartFixture);
      }),
    );
    const cart = await getCartForRequest();
    expect(seen).toEqual(["Bearer tok-1", "guest_cart=abcdefghijklmnopqrstuv"]);
    expect(cart?.itemCount).toBe(cartFixture.itemCount);
  });

  it("guest without a token sends no authorization header", async () => {
    cookies({ guest_cart: "abcdefghijklmnopqrstuv" });
    const seen: Array<string | null> = [];
    server.use(
      http.get("*/api/cart", ({ request }) => {
        seen.push(request.headers.get("authorization"));
        return HttpResponse.json(cartFixture);
      }),
    );
    await getCartForRequest();
    expect(seen).toEqual([null]);
  });

  it("returns null on a timeout within the budget", async () => {
    cookies({ access_token: "tok-1" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    server.use(cartOverrides.slowCart(1000));
    const start = Date.now();
    expect(await getCartForRequest()).toBeNull();
    expect(Date.now() - start).toBeLessThan(900);
  });

  it("returns null on a 401", async () => {
    cookies({ access_token: "expired" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    server.use(
      http.get("*/api/cart", () =>
        HttpResponse.json(
          { type: "about:blank", title: "U", status: 401, code: "AUTH_UNAUTHENTICATED" },
          { status: 401, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    expect(await getCartForRequest()).toBeNull();
  });

  it("returns null on a 503", async () => {
    cookies({ access_token: "tok-1" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    server.use(cartOverrides.cartUnavailable);
    expect(await getCartForRequest()).toBeNull();
  });
});
