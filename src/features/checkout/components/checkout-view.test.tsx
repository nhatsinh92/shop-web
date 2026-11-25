import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { checkoutOverrides } from "@mocks/checkout-handlers";
import { buildReservation, reservationItem } from "@mocks/fixtures/checkout";
import { server } from "@mocks/node";

import { CheckoutView } from "./checkout-view";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));

async function createReservation(): Promise<string> {
  const res = await fetch("http://localhost/api/checkout/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
  });
  return (await res.json()).id;
}

const wrap = (id: string, client: QueryClient) => (
  <QueryClientProvider client={client}>
    <CheckoutView reservationId={id} />
  </QueryClientProvider>
);
const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function respondWith(status: "RELEASED" | "EXPIRED") {
  const item = reservationItem("SKU-ANC-PRO-BLK", 1)!;
  server.use(
    http.get("*/api/checkout/reservations/:id", ({ params }) =>
      HttpResponse.json(
        buildReservation(String(params.id), [item], "2030-01-01T00:00:00Z", status),
      ),
    ),
  );
}

describe("CheckoutView hold", () => {
  beforeEach(() => {
    replace.mockReset();
    push.mockReset();
    sessionStorage.clear();
  });

  it("shows the hold banner and the summary for an active reservation", async () => {
    const id = await createReservation();
    render(wrap(id, newClient()));
    expect(await screen.findByText(/Sản phẩm đang được giữ cho bạn/)).toBeInTheDocument();
    expect(screen.getByText("Đơn hàng (1 sản phẩm)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Giữ hàng lại" })).not.toBeInTheDocument();
  });

  it("shows the expired state when the server reports EXPIRED (reservationExpiresIn)", async () => {
    server.use(checkoutOverrides.reservationExpiresIn(0));
    const id = await createReservation();
    render(wrap(id, newClient()));
    expect(await screen.findByRole("heading", { name: "Hết thời gian giữ hàng" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Giữ hàng lại" })).toBeEnabled();
    expect(screen.queryByText(/Sản phẩm đang được giữ cho bạn/)).not.toBeInTheDocument();
  });

  it("shows the released title for status RELEASED", async () => {
    respondWith("RELEASED");
    render(wrap("6f1c1f0e-7a3e-4a53-9a55-0d6c2a3f9a11", newClient()));
    expect(
      await screen.findByRole("heading", { name: "Phiên thanh toán đã được mở ở nơi khác" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Giữ hàng lại" })).toBeInTheDocument();
  });

  it("shows the expired state for 410 CHECKOUT_RESERVATION_EXPIRED", async () => {
    server.use(
      http.get("*/api/checkout/reservations/:id", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Expired",
            status: 410,
            code: "CHECKOUT_RESERVATION_EXPIRED",
          },
          { status: 410, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    render(wrap("6f1c1f0e-7a3e-4a53-9a55-0d6c2a3f9a11", newClient()));
    expect(await screen.findByRole("heading", { name: "Hết thời gian giữ hàng" })).toBeVisible();
    // Without the lines there is nothing to reserve again: the action leads back to the cart.
    await userEvent.click(screen.getByRole("button", { name: "Giữ hàng lại" }));
    expect(push).toHaveBeenCalledWith("/cart");
  });

  it("switches to the expired state when the countdown reaches 0", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    try {
      server.use(checkoutOverrides.reservationExpiresIn(3_000));
      const id = await createReservation();
      render(wrap(id, newClient()));
      await screen.findByText(/Sản phẩm đang được giữ cho bạn/);
      act(() => vi.advanceTimersByTime(3_500));
      expect(await screen.findByRole("heading", { name: "Hết thời gian giữ hàng" })).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reserves the same lines again, replaces the URL and keeps the view mounted", async () => {
    server.use(checkoutOverrides.reservationExpiresIn(0));
    const id = await createReservation();
    server.resetHandlers();
    const bodies: unknown[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST") bodies.push(await request.clone().json());
    });
    const client = newClient();
    const { container, rerender } = render(wrap(id, client));
    await userEvent.click(await screen.findByRole("button", { name: "Giữ hàng lại" }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    server.events.removeAllListeners();

    const url = String(replace.mock.calls[0]?.[0]);
    const newId = url.split("=")[1] ?? "";
    expect(url).toMatch(/^\/checkout\?reservation=[0-9a-f-]{36}$/);
    expect(newId).not.toBe(id);
    expect(bodies).toEqual([{ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }]);

    const root = container.firstElementChild;
    const shippingSection = screen.getByRole("heading", { name: "Phương thức vận chuyển" });
    rerender(wrap(newId, client));
    expect(await screen.findByText(/Sản phẩm đang được giữ cho bạn/)).toBeInTheDocument();
    expect(container.firstElementChild).toBe(root);
    expect(screen.getByRole("heading", { name: "Phương thức vận chuyển" })).toBe(shippingSection);
  });
});
