import { http, HttpResponse } from "msw";

import { checkoutOverrides } from "@mocks/checkout-handlers";
import { server } from "@mocks/node";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));

import { CHECKOUT_BUDGET_MS, getCheckoutForRequest } from "./checkout.server";

const RESERVATION = "00000000-0000-4000-8000-000000000001";

async function createReservation(): Promise<string> {
  const res = await fetch("http://localhost/api/checkout/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
  }).catch(() => null);
  return res ? (await res.json()).id : RESERVATION;
}

describe("getCheckoutForRequest", () => {
  beforeEach(() => {
    cookieGet.mockReset();
    cookieGet.mockImplementation((name: string) =>
      name === "access_token" ? { name, value: "tok-1" } : undefined,
    );
  });

  it("uses a 300 ms budget", () => {
    expect(CHECKOUT_BUDGET_MS).toBe(300);
  });

  it("returns all three results when every call succeeds, with the bearer token", async () => {
    const seen: Array<string | null> = [];
    server.events.on("request:start", ({ request }) => {
      seen.push(request.headers.get("authorization"));
    });
    const id = await createReservation();
    seen.length = 0;
    const data = await getCheckoutForRequest(id);
    server.events.removeAllListeners();
    expect(data.reservation).toMatchObject({ ok: true, status: "ok" });
    expect(data.shippingOptions).toMatchObject({ ok: true });
    expect(data.paymentMethods).toMatchObject({ ok: true });
    expect(seen).toEqual(["Bearer tok-1", "Bearer tok-1", "Bearer tok-1"]);
  });

  it("times out one slow call within the budget while the others succeed", async () => {
    server.use(
      http.get("*/api/checkout/reservations/:id", async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return HttpResponse.json({});
      }),
    );
    const id = await createReservation();
    const started = Date.now();
    const data = await getCheckoutForRequest(id);
    expect(Date.now() - started).toBeLessThan(800);
    expect(data.reservation).toEqual({ status: "timeout", ok: false });
    expect(data.shippingOptions.ok).toBe(true);
    expect(data.paymentMethods.ok).toBe(true);
  });

  it("times out every call when all are slowed by slowCheckout", async () => {
    server.use(...checkoutOverrides.slowCheckout(1000));
    const id = RESERVATION;
    const data = await getCheckoutForRequest(id);
    expect(data.shippingOptions).toEqual({ status: "timeout", ok: false });
    expect(data.paymentMethods).toEqual({ status: "timeout", ok: false });
  });

  it("reports notFound for an unknown reservation, independent of the others", async () => {
    const data = await getCheckoutForRequest(RESERVATION);
    expect(data.reservation).toEqual({ status: "notFound", ok: false });
    expect(data.paymentMethods.ok).toBe(true);
  });

  it("reports unauthorized for a 401", async () => {
    server.use(
      http.get("*/api/checkout/*", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Unauthorized", status: 401, code: "UNAUTHORIZED" },
          { status: 401, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const data = await getCheckoutForRequest(RESERVATION);
    expect(data.reservation).toEqual({ status: "unauthorized", ok: false });
    expect(data.shippingOptions).toEqual({ status: "unauthorized", ok: false });
    expect(data.paymentMethods).toEqual({ status: "unauthorized", ok: false });
  });

  it("reports error for a 503 without throwing", async () => {
    server.use(...checkoutOverrides.checkoutUnavailable);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const data = await getCheckoutForRequest(RESERVATION);
    expect(data.reservation).toEqual({ status: "error", ok: false });
    expect(data.paymentMethods).toEqual({ status: "error", ok: false });
  });
});
