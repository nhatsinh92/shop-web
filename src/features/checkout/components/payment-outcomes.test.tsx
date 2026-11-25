import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";

import { checkoutOverrides, checkoutState } from "@mocks/checkout-handlers";
import { server } from "@mocks/node";

import { resetOrderProgress } from "./checkout-progress";
import { CheckoutView } from "./checkout-view";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const problem = (status: number, code: string, extra: object = {}) =>
  HttpResponse.json(
    { type: "about:blank", title: code, status, code, ...extra },
    { status, headers: { "content-type": "application/problem+json" } },
  );

async function createReservation(): Promise<string> {
  const res = await fetch("http://localhost/api/checkout/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
  });
  return (await res.json()).id;
}

async function renderView() {
  const id = await createReservation();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CheckoutView reservationId={id} />
    </QueryClientProvider>,
  );
  await screen.findByRole("radio", { name: /Giao tiêu chuẩn/ });
  return id;
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

function recordOrderPosts() {
  const keys: string[] = [];
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/api/orders")) {
      keys.push(request.headers.get("Idempotency-Key") ?? "");
    }
  });
  return keys;
}

/** Pays with the e-wallet and forces the mock outcome through the demo select. */
async function placeOnline(outcome: "Thất bại" | "Quá thời gian") {
  fill();
  await userEvent.click(screen.getByRole("radio", { name: /Ví điện tử/ }));
  await userEvent.selectOptions(screen.getByLabelText(/Kết quả thanh toán/), outcome);
  await userEvent.click(placeButton());
}

describe("payment outcomes and place-order errors", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetOrderProgress();
    router.replace.mockClear();
    vi.stubEnv("NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS", "1");
  });
  afterEach(() => {
    server.events.removeAllListeners();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("PAYMENT_FAILED + FAILED shows 'Thanh toán không thành công' with both ways out", async () => {
    await renderView();
    await placeOnline("Thất bại");
    expect(await screen.findByText("Thanh toán không thành công")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Đổi sang COD" })).toBeVisible();
  });

  it("PAYMENT_FAILED + TIMED_OUT shows 'Thanh toán quá thời gian chờ' with both ways out", async () => {
    await renderView();
    await placeOnline("Quá thời gian");
    expect(await screen.findByText("Thanh toán quá thời gian chờ")).toBeVisible();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Đổi sang COD" })).toBeVisible();
  });

  it("'Thử lại' reserves the same lines again, keeps every value and uses a new key", async () => {
    const keys = recordOrderPosts();
    await renderView();
    await placeOnline("Thất bại");
    await screen.findByText("Thanh toán không thành công");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
    expect(router.replace.mock.calls[0]?.[0]).toMatch(/^\/checkout\?reservation=/);
    expect(screen.queryByText("Thanh toán không thành công")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901234567");
    expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn An");
    expect(screen.getByRole("radio", { name: /Ví điện tử/ })).toBeChecked();
    expect(checkoutState.orderCount()).toBe(1);
    await userEvent.click(placeButton());
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("'Đổi sang COD' selects COD, reserves again and returns to the form", async () => {
    await renderView();
    await placeOnline("Thất bại");
    await screen.findByText("Thanh toán không thành công");
    await userEvent.click(screen.getByRole("button", { name: "Đổi sang COD" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledOnce());
    expect(screen.getByRole("radio", { name: /Thanh toán khi nhận hàng|COD/ })).toBeChecked();
    expect(screen.getByLabelText("Số điện thoại")).toHaveValue("0901234567");
    expect(screen.getByLabelText("Địa chỉ")).toHaveValue("12 Lê Lợi");
  });

  it("PENDING_PAYMENT shows 'Đang xác nhận thanh toán…' and polls the order until it is paid", async () => {
    server.use(...checkoutOverrides.orderPendingPayment(2));
    await renderView();
    fill();
    await userEvent.click(screen.getByRole("radio", { name: /Ví điện tử/ }));
    await userEvent.click(placeButton());
    expect(await screen.findByText("Đang xác nhận thanh toán…")).toBeVisible();
    expect(await screen.findByText("Đặt hàng thành công", {}, { timeout: 9_000 })).toBeVisible();
    expect(screen.queryByText("Đang xác nhận thanh toán…")).not.toBeInTheDocument();
  }, 15_000);

  it("still pending after 30 s shows 'Chưa xác nhận được thanh toán' and places no new order", async () => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    server.use(...checkoutOverrides.orderPendingPayment(1_000));
    const keys = recordOrderPosts();
    await renderView();
    fill();
    fireEvent.click(screen.getByRole("radio", { name: /Ví điện tử/ }));
    fireEvent.click(placeButton());
    expect(await screen.findByText("Đang xác nhận thanh toán…")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    expect(await screen.findByText("Chưa xác nhận được thanh toán")).toBeVisible();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Đặt hàng" })).not.toBeInTheDocument();
    expect(keys).toHaveLength(1);
  });

  it("410 CHECKOUT_RESERVATION_EXPIRED shows the expired state", async () => {
    server.use(http.post("*/api/orders", () => problem(410, "CHECKOUT_RESERVATION_EXPIRED")));
    await renderView();
    fill();
    await userEvent.click(placeButton());
    expect(await screen.findByText("Hết thời gian giữ hàng")).toBeVisible();
    expect(screen.getByRole("button", { name: "Giữ hàng lại" })).toBeVisible();
  });

  it("410 CHECKOUT_RESERVATION_CONSUMED shows 'Đơn hàng này đã được đặt' with the way home", async () => {
    server.use(http.post("*/api/orders", () => problem(410, "CHECKOUT_RESERVATION_CONSUMED")));
    await renderView();
    fill();
    await userEvent.click(placeButton());
    expect(await screen.findByText("Đơn hàng này đã được đặt")).toBeVisible();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });

  it("400 VALIDATION_FAILED sets each errors[].field on its form field and focuses the first", async () => {
    server.use(
      http.post("*/api/orders", () =>
        problem(400, "VALIDATION_FAILED", {
          errors: [
            { field: "shippingAddress.phone", code: "invalid" },
            { field: "shippingAddress.ward", code: "invalid" },
          ],
        }),
      ),
    );
    await renderView();
    fill();
    await userEvent.click(placeButton());
    const phone = await screen.findByLabelText("Số điện thoại");
    await waitFor(() => expect(phone).toHaveAttribute("aria-invalid", "true"));
    expect(phone).toHaveFocus();
    expect(screen.getByLabelText("Phường/Xã")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Họ và tên")).not.toHaveAttribute("aria-invalid");
    expect(placeButton()).toBeEnabled();
  });

  it("422 CHECKOUT_PAYMENT_METHOD_UNAVAILABLE disables that method and refetches the methods", async () => {
    await renderView();
    fill();
    server.use(...checkoutOverrides.cardUnavailable);
    let reads = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/api/checkout/payment-methods")) reads += 1;
    });
    await userEvent.click(screen.getByRole("radio", { name: /Thẻ/ }));
    await userEvent.click(placeButton());
    await waitFor(() => expect(screen.getByRole("radio", { name: /Thẻ/ })).toBeDisabled());
    expect(reads).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("radio", { name: /Thanh toán khi nhận hàng|COD/ })).toBeChecked();
  });

  it("422 IDEMPOTENCY_KEY_REUSED makes a new key and retries once", async () => {
    const keys = recordOrderPosts();
    server.use(
      http.post("*/api/orders", () => problem(422, "IDEMPOTENCY_KEY_REUSED"), { once: true }),
    );
    await renderView();
    fill();
    await userEvent.click(placeButton());
    expect(await screen.findByText("Đặt hàng thành công")).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it("a second 422 IDEMPOTENCY_KEY_REUSED shows messageFor(error) and stops", async () => {
    const keys = recordOrderPosts();
    server.use(http.post("*/api/orders", () => problem(422, "IDEMPOTENCY_KEY_REUSED")));
    await renderView();
    fill();
    await userEvent.click(placeButton());
    expect(
      await screen.findByText("Yêu cầu này đã được gửi trước đó. Vui lòng tải lại trang."),
    ).toBeVisible();
    expect(keys).toHaveLength(2);
    expect(placeButton()).toBeEnabled();
  });

  it("429 shows a toast with messageFor(error) and enables the button again", async () => {
    server.use(http.post("*/api/orders", () => problem(429, "RATE_LIMITED")));
    await renderView();
    fill();
    await userEvent.click(placeButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
      ),
    );
    expect(placeButton()).toBeEnabled();
  });

  it("503 shows a toast with messageFor(error) and enables the button again (checkoutUnavailable)", async () => {
    await renderView();
    fill();
    server.use(...checkoutOverrides.checkoutUnavailable);
    await userEvent.click(placeButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Hệ thống đang quá tải. Vui lòng thử lại sau."),
    );
    expect(placeButton()).toBeEnabled();
  });
});
