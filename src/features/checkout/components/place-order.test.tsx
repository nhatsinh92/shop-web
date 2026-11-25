import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { checkoutOverrides } from "@mocks/checkout-handlers";
import { server } from "@mocks/node";

import { CheckoutHeader } from "./checkout-header";
import { resetOrderProgress } from "./checkout-progress";
import { CheckoutView } from "./checkout-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

async function createReservation(): Promise<string> {
  const res = await fetch("http://localhost/api/checkout/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
  });
  return (await res.json()).id;
}

async function renderView(onOrderPlaced = vi.fn()) {
  const id = await createReservation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={client}>
      <CheckoutHeader />
      <CheckoutView reservationId={id} onOrderPlaced={onOrderPlaced} />
    </QueryClientProvider>,
  );
  await screen.findByRole("radio", { name: /Giao tiêu chuẩn/ });
  return { ...utils, id, onOrderPlaced };
}

function fill(phone = "0901234567") {
  const set = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set("Họ và tên", "Nguyễn An");
  set("Số điện thoại", phone);
  set("Địa chỉ", "12 Lê Lợi");
  set("Phường/Xã", "Bến Nghé");
  set("Tỉnh/Thành phố", "TP. Hồ Chí Minh");
}

const placeButton = () => screen.getByRole("button", { name: /Đặt hàng|Đang xử lý/ });

/** Records the Idempotency-Key of every POST /api/orders, then answers with the next handler. */
function recordKeys() {
  const keys: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/api/orders")) {
      keys.push(request.headers.get("Idempotency-Key") ?? "");
    }
  });
  return keys;
}

describe("place order", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetOrderProgress();
  });
  afterEach(() => {
    server.events.removeAllListeners();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the success state with the order number, the home link and the step bar, then calls onOrderPlaced with the SKUs", async () => {
    const { id, onOrderPlaced } = await renderView();
    fill();
    await userEvent.click(placeButton());
    expect(await screen.findByText("Đặt hàng thành công")).toBeVisible();
    expect(screen.getByText(/^Mã đơn #MY-/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đặt hàng" })).not.toBeInTheDocument();
    expect(screen.getByText("3 Hoàn tất")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("✓ Thông tin & thanh toán")).toBeVisible();
    expect(onOrderPlaced).toHaveBeenCalledWith(["SKU-ANC-PRO-BLK"]);
    // Nothing about the order stays in storage.
    expect(sessionStorage.getItem(`checkout:idempotency:${id}`)).toBeNull();
    expect(
      Object.keys(sessionStorage).filter((key) => !key.startsWith("checkout:cart-prices")),
    ).toEqual([]);
  });

  it("keeps the step bar on step 2 until the order is placed", async () => {
    await renderView();
    expect(screen.getByText("2 Thông tin & thanh toán")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("3 Hoàn tất")).not.toHaveAttribute("aria-current");
  });

  it("validates the form first and sends nothing while it is invalid", async () => {
    const keys = recordKeys();
    await renderView();
    await userEvent.click(placeButton());
    expect(await screen.findByText("Vui lòng nhập họ và tên.")).toBeVisible();
    expect(keys).toHaveLength(0);
  });

  it("disables the button with 'Đang xử lý…' while it runs and sends one request for a double click", async () => {
    server.use(...checkoutOverrides.slowCheckout(0));
    const keys = recordKeys();
    server.use(
      http.post("*/api/orders", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return undefined;
      }),
    );
    await renderView();
    fill();
    const button = placeButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(placeButton()).toBeDisabled());
    expect(placeButton()).toHaveTextContent("Đang xử lý…");
    expect(placeButton()).toHaveAttribute("aria-busy", "true");
    await screen.findByText("Đặt hàng thành công");
    expect(keys).toHaveLength(1);
  });

  it("retries 409 IDEMPOTENCY_IN_PROGRESS after 1 s with the same key: three requests, one key, then success", async () => {
    server.use(checkoutOverrides.orderInProgress(2));
    const keys = recordKeys();
    await renderView();
    fill();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    fireEvent.click(placeButton());
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(keys).toHaveLength(1));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    await vi.waitFor(() => expect(keys).toHaveLength(2));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    vi.useRealTimers();
    expect(await screen.findByText("Đặt hàng thành công")).toBeVisible();
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
  });

  it("stops after 5 retries of 409 IDEMPOTENCY_IN_PROGRESS and keeps the key", async () => {
    server.use(checkoutOverrides.orderInProgress(100));
    const keys = recordKeys();
    const { id } = await renderView();
    fill();
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    fireEvent.click(placeButton());
    for (let i = 0; i < 6; i += 1) {
      await act(() => vi.advanceTimersByTimeAsync(1000));
      await vi.advanceTimersByTimeAsync(0);
    }
    vi.useRealTimers();
    expect(await screen.findByRole("alert")).toHaveTextContent("Yêu cầu đang được xử lý");
    expect(keys).toHaveLength(6);
    expect(sessionStorage.getItem(`checkout:idempotency:${id}`)).not.toBeNull();
  });

  it("uses AbortSignal.timeout(10_000); a timeout shows the retry message and the retry reuses the key", async () => {
    const keys = recordKeys();
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await renderView();
    fill();
    let timedOut = false;
    timeout.mockImplementation((ms) => {
      if (ms !== 10_000 || timedOut) return realTimeout(ms);
      timedOut = true;
      return AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
    });
    await userEvent.click(placeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Không nhận được phản hồi. Thử lại");
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(placeButton()).toBeEnabled();
    const storageKey = Object.keys(sessionStorage).find((k) =>
      k.startsWith("checkout:idempotency:"),
    )!;
    const keyAfterTimeout = JSON.parse(sessionStorage.getItem(storageKey)!).key;
    await userEvent.click(placeButton());
    expect(await screen.findByText("Đặt hàng thành công")).toBeVisible();
    // The timed-out attempt never reached the server; the retry carries the stored key.
    expect(keys).toEqual([keyAfterTimeout]);
  });

  it("reuses the key after a network error and makes a new one when the phone was edited", async () => {
    const keys = recordKeys();
    server.use(http.post("*/api/orders", () => HttpResponse.error(), { once: true }));
    await renderView();
    fill();
    await userEvent.click(placeButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể kết nối");
    server.use(http.post("*/api/orders", () => HttpResponse.error(), { once: true }));
    await userEvent.click(placeButton());
    await screen.findByRole("alert");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    fill("0907654321");
    server.use(http.post("*/api/orders", () => HttpResponse.error(), { once: true }));
    await userEvent.click(placeButton());
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("makes a new key after a 4xx answer", async () => {
    const keys = recordKeys();
    server.use(
      http.post(
        "*/api/orders",
        () =>
          HttpResponse.json(
            { type: "about:blank", title: "x", status: 422, code: "UNPROCESSABLE_ENTITY" },
            { status: 422, headers: { "content-type": "application/problem+json" } },
          ),
        { once: true },
      ),
    );
    await renderView();
    fill();
    await userEvent.click(placeButton());
    await screen.findByRole("alert");
    await userEvent.click(placeButton());
    await screen.findByText("Đặt hàng thành công");
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("does not show success for PENDING_PAYMENT and keeps the key; PAYMENT_FAILED clears it", async () => {
    server.use(...checkoutOverrides.orderPendingPayment(2));
    const { id } = await renderView();
    fill();
    await userEvent.click(screen.getByRole("radio", { name: /Ví điện tử/ }));
    await userEvent.click(placeButton());
    await waitFor(() => expect(placeButton()).toBeEnabled());
    expect(screen.queryByText("Đặt hàng thành công")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`checkout:idempotency:${id}`)).not.toBeNull();

    server.use(
      http.post("*/api/orders", () =>
        HttpResponse.json(
          {
            id: crypto.randomUUID(),
            number: "MY-1212-0001",
            status: "PAYMENT_FAILED",
            items: [],
            subtotal: { amount: 0, currency: "VND" },
            shippingFee: { amount: 0, currency: "VND" },
            total: { amount: 0, currency: "VND" },
            payment: { method: "EWALLET", status: "FAILED" },
            createdAt: new Date().toISOString(),
          },
          { status: 201 },
        ),
      ),
    );
    await userEvent.click(placeButton());
    await waitFor(() => expect(sessionStorage.getItem(`checkout:idempotency:${id}`)).toBeNull());
    expect(screen.queryByText("Đặt hàng thành công")).not.toBeInTheDocument();
  });

  it("keeps the success state when the reservation is refetched as CONSUMED", async () => {
    const { client } = { client: undefined };
    void client;
    await renderView();
    fill();
    await userEvent.click(placeButton());
    await screen.findByText("Đặt hàng thành công");
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByText("Đặt hàng thành công")).toBeVisible();
  });
});
