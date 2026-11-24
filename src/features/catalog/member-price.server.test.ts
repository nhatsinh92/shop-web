import { http, HttpResponse } from "msw";

import { productOverrides } from "../../../mocks/product-handlers";
import { productDetailFixtures } from "../../../mocks/fixtures/products";
import { server } from "../../../mocks/node";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));

import { MEMBER_PRICE_BUDGET_MS, getMemberPriceForRequest } from "./member-price.server";

const slug = productDetailFixtures[0]!.slug;

function cookies(values: Record<string, string>) {
  cookieGet.mockImplementation((name: string) =>
    name in values ? { name, value: values[name] } : undefined,
  );
}

describe("getMemberPriceForRequest", () => {
  beforeEach(() => cookieGet.mockReset());

  it("sends the bearer token from the access cookie only and returns the price", async () => {
    cookies({ access_token: "tok-1" });
    const seen: Array<string | null> = [];
    server.use(
      http.get("*/api/products/:slug/member-price", ({ request }) => {
        seen.push(request.headers.get("authorization"));
        return HttpResponse.json({
          sku: "S",
          memberTier: "GOLD",
          price: { amount: 1, currency: "VND" },
        });
      }),
    );
    const result = await getMemberPriceForRequest(slug);
    expect(seen).toEqual(["Bearer tok-1"]);
    expect(result).toMatchObject({ kind: "price", price: { memberTier: "GOLD" } });
  });

  it("is not cached: every call reaches the backend", async () => {
    cookies({ access_token: "tok-1" });
    let calls = 0;
    server.use(
      http.get("*/api/products/:slug/member-price", () => {
        calls += 1;
        return HttpResponse.json({
          sku: "S",
          memberTier: "GOLD",
          price: { amount: 1, currency: "VND" },
        });
      }),
    );
    await getMemberPriceForRequest(slug);
    await getMemberPriceForRequest(slug);
    expect(calls).toBe(2);
  });

  it("returns guest without any session cookie, without calling the backend", async () => {
    cookies({});
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "guest" });
  });

  it("returns client when the hint cookie has no access cookie", async () => {
    cookies({ logged_in: "1" });
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "client" });
  });

  it("returns client when the backend exceeds the 250 ms budget", async () => {
    cookies({ access_token: "tok-1" });
    expect(MEMBER_PRICE_BUDGET_MS).toBe(250);
    server.use(productOverrides.delayedMemberPrice("infinite"));
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "client" });
  });

  it("returns client on 401", async () => {
    cookies({ access_token: "expired" });
    server.use(
      http.get("*/api/products/:slug/member-price", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_UNAUTHENTICATED" },
          { status: 401, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "client" });
  });

  it("returns none on any other error", async () => {
    cookies({ access_token: "tok-1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("*/api/products/:slug/member-price", () => new HttpResponse(null, { status: 500 })),
    );
    expect(await getMemberPriceForRequest(slug)).toEqual({ kind: "none" });
  });
});
