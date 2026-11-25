import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { checkoutOverrides } from "@mocks/checkout-handlers";
import { buildReservation, reservationItem } from "@mocks/fixtures/checkout";
import { server } from "@mocks/node";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookieGet }) }));

import { CheckoutSection } from "./checkout-section";
import { CheckoutView } from "./components/checkout-view";

async function createReservation(): Promise<string> {
  const res = await fetch("http://localhost/api/checkout/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
  });
  return (await res.json()).id;
}

async function renderSection(id: string) {
  const ui = await CheckoutSection({
    reservationId: id,
    children: <CheckoutView reservationId={id} />,
  });
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("CheckoutSection", () => {
  beforeEach(() => cookieGet.mockReturnValue({ name: "access_token", value: "t" }));

  it("hydrates the reads that arrived so the view renders them at once", async () => {
    const id = await createReservation();
    await renderSection(id);
    expect(screen.getByText("Giao tiêu chuẩn")).toBeInTheDocument();
    expect(screen.getByText("Ví điện tử")).toBeInTheDocument();
    expect(screen.getByText("Đơn hàng (1 sản phẩm)")).toBeInTheDocument();
  });

  it("renders without waiting for slow reads and the client then shows the data", async () => {
    const id = await createReservation();
    server.use(...checkoutOverrides.slowCheckout(1000));
    const started = Date.now();
    await renderSection(id);
    expect(Date.now() - started).toBeLessThan(900);
    expect(screen.getByText("Đang tải thông tin thanh toán…")).toBeInTheDocument();
    expect(await screen.findByText("Đơn hàng (1 sản phẩm)", {}, { timeout: 3000 })).toBeVisible();
    await waitFor(() => expect(screen.getByText("Giao tiêu chuẩn")).toBeInTheDocument());
  });

  it("shows the not-found state for a 404", async () => {
    await renderSection("00000000-0000-4000-8000-000000000009");
    expect(screen.getByText("Không tìm thấy phiên thanh toán")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quay lại giỏ hàng" })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("shows the consumed state for a CONSUMED reservation", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const item = reservationItem("SKU-ANC-PRO-BLK", 1)!;
    server.use(
      http.get("*/api/checkout/reservations/:id", () =>
        HttpResponse.json(buildReservation(id, [item], new Date().toISOString(), "CONSUMED")),
      ),
    );
    await renderSection(id);
    expect(screen.getByText("Đơn hàng này đã được đặt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });

  it("leaves a 401 to the client query", async () => {
    const id = await createReservation();
    let reservationReads = 0;
    server.use(
      http.get("*/api/checkout/reservations/:id", () => {
        reservationReads += 1;
      }),
      http.get(
        "*/api/checkout/reservations/:id",
        () =>
          HttpResponse.json(
            { code: "AUTH_UNAUTHENTICATED", title: "Unauthenticated", status: 401 },
            { status: 401, headers: { "content-type": "application/problem+json" } },
          ),
        { once: true },
      ),
    );
    await renderSection(id);
    expect(reservationReads).toBe(1);
    expect(screen.queryByText("Đơn hàng (1 sản phẩm)")).not.toBeInTheDocument();
    expect(await screen.findByText("Đơn hàng (1 sản phẩm)")).toBeVisible();
    expect(reservationReads).toBe(2);
  });
});
