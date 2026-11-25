import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";

import { checkoutOverrides } from "@mocks/checkout-handlers";
import { server } from "@mocks/node";
import { vnd } from "@mocks/fixtures/checkout";

import { readCartPrices } from "../cart-prices";
import { StartCheckout } from "./start-checkout";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const lines = [
  { sku: "SKU-ANC-PRO-BLK", name: "Tai nghe ANC Pro", quantity: 1, unitPrice: vnd(2_490_000) },
];

function watchReservations(): Array<unknown> {
  const bodies: Array<unknown> = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/api/checkout/reservations")) {
      bodies.push(await request.clone().json());
    }
  });
  return bodies;
}

describe("StartCheckout", () => {
  beforeEach(() => {
    replace.mockReset();
    sessionStorage.clear();
  });
  afterEach(() => server.events.removeAllListeners());

  it("shows the skeleton with the holding message while the lines load", () => {
    render(<StartCheckout lines={[]} isPending />);
    expect(screen.getByText("Đang giữ hàng cho bạn…")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("reserves once in StrictMode, keeps the cart prices and replaces the URL", async () => {
    const bodies = watchReservations();
    render(
      <StrictMode>
        <StartCheckout lines={lines} isPending={false} />
      </StrictMode>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const url = String(replace.mock.calls[0]?.[0]);
    expect(url).toMatch(/^\/checkout\?reservation=[0-9a-f-]{36}$/);
    expect(bodies).toEqual([
      { items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1, expectedUnitPrice: vnd(2_490_000) }] },
    ]);
    expect(readCartPrices(url.split("=")[1] ?? "")).toEqual({
      "SKU-ANC-PRO-BLK": vnd(2_490_000),
    });
  });

  it("goes back to the cart without a request when no line is selected", async () => {
    const bodies = watchReservations();
    render(<StartCheckout lines={[]} isPending={false} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    expect(bodies).toHaveLength(0);
  });

  it("on 409 CHECKOUT_OUT_OF_STOCK goes to the cart, toasts each line and refreshes the cart", async () => {
    server.use(checkoutOverrides.reservationOutOfStock);
    const onOutOfStock = vi.fn();
    render(<StartCheckout lines={lines} isPending={false} onOutOfStock={onOutOfStock} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/^Không đủ hàng: Tai nghe ANC Pro \(còn \d+\)$/),
    );
    expect(onOutOfStock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the SKU for an unavailable line the cart does not know", async () => {
    server.use(
      http.post("*/api/checkout/reservations", () =>
        HttpResponse.json(
          {
            code: "CHECKOUT_OUT_OF_STOCK",
            title: "Out of stock",
            status: 409,
            unavailable: [{ sku: "SKU-UNKNOWN", requested: 2, available: 1 }],
          },
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    render(<StartCheckout lines={lines} isPending={false} />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Không đủ hàng: SKU-UNKNOWN (còn 1)"),
    );
  });

  it("shows an error and retries on another failure", async () => {
    server.use(...checkoutOverrides.checkoutUnavailable);
    render(<StartCheckout lines={lines} isPending={false} />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    server.resetHandlers();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });
});
