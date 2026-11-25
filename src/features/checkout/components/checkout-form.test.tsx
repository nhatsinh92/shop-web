import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { checkoutOverrides } from "@mocks/checkout-handlers";
import { server } from "@mocks/node";

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

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const view = (id: string, client: QueryClient, displayName?: string) => (
  <QueryClientProvider client={client}>
    <CheckoutView reservationId={id} displayName={displayName} />
  </QueryClientProvider>
);

async function renderView(displayName?: string) {
  const id = await createReservation();
  const client = newClient();
  const utils = render(view(id, client, displayName));
  await screen.findByRole("radio", { name: /Giao tiêu chuẩn/ });
  return { ...utils, id, client };
}

const submit = () => fireEvent.submit(document.getElementById("checkout-address-form")!);

describe("checkout address form", () => {
  it("shows the fields in order with visible labels", async () => {
    await renderView();
    const labels = [
      "Họ và tên",
      "Số điện thoại",
      "Địa chỉ",
      "Phường/Xã",
      "Quận/Huyện",
      "Tỉnh/Thành phố",
      "Ghi chú",
    ];
    const form = document.getElementById("checkout-address-form")!;
    const found = [...form.querySelectorAll("label")].map((l) => l.textContent ?? "");
    expect(found).toHaveLength(labels.length);
    labels.forEach((label, i) => expect(found[i]).toContain(label));
    expect(screen.getByLabelText(/Quận\/Huyện/)).toBeInTheDocument();
    expect(screen.getByText("Không bắt buộc")).toBeVisible();
    expect(screen.getByLabelText("Ghi chú")).not.toBeRequired();
  });

  it("shows each error linked with aria-describedby and focuses the first invalid field", async () => {
    await renderView();
    await userEvent.type(screen.getByLabelText("Số điện thoại"), "0123");
    submit();
    const phone = await screen.findByLabelText("Số điện thoại");
    const error = await screen.findByText("Số điện thoại không hợp lệ");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAttribute("aria-describedby", error.id);
    const name = screen.getByLabelText("Họ và tên");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "address-fullName-error");
    expect(screen.getByText("Vui lòng nhập họ và tên.").id).toBe("address-fullName-error");
    await waitFor(() => expect(name).toHaveFocus());
  });

  it("prefills the name from displayName only when empty", async () => {
    const { rerender, id, client } = await renderView();
    expect(screen.getByLabelText("Họ và tên")).toHaveValue("");
    rerender(view(id, client, "Nguyễn An"));
    await waitFor(() => expect(screen.getByLabelText("Họ và tên")).toHaveValue("Nguyễn An"));
  });

  it("does not overwrite a typed name when displayName arrives later", async () => {
    const { rerender, id, client } = await renderView();
    await userEvent.type(screen.getByLabelText("Họ và tên"), "Trần Bình");
    rerender(view(id, client, "Nguyễn An"));
    expect(screen.getByLabelText("Họ và tên")).toHaveValue("Trần Bình");
  });

  it("keeps values in RHF state only and across a reservation change", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { rerender, client } = await renderView();
    await userEvent.type(screen.getByLabelText("Địa chỉ"), "12 Lê Lợi");
    await userEvent.type(screen.getByLabelText("Ghi chú"), "Gọi trước");
    const newId = await createReservation();
    rerender(view(newId, client));
    await screen.findByRole("radio", { name: /Giao tiêu chuẩn/ });
    expect(screen.getByLabelText("Địa chỉ")).toHaveValue("12 Lê Lợi");
    expect(screen.getByLabelText("Ghi chú")).toHaveValue("Gọi trước");
    expect(JSON.stringify(setItem.mock.calls)).not.toContain("Lê Lợi");
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain("Lê Lợi");
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain("Lê Lợi");
    setItem.mockRestore();
  });
});

describe("checkout shipping and payment options", () => {
  it("selects the first shipping option and feeds its fee to the summary", async () => {
    await renderView();
    const standard = screen.getByRole("radio", { name: /Giao tiêu chuẩn/ });
    expect(standard).toBeChecked();
    expect(screen.getByText("Nhận hàng 2–3 ngày")).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Đơn hàng" });
    expect(within(summary).getByText("Vận chuyển").nextSibling).toHaveTextContent("Miễn phí");
    await userEvent.click(screen.getByRole("radio", { name: /Giao hỏa tốc 2 giờ/ }));
    expect(screen.getByRole("radio", { name: /Giao hỏa tốc 2 giờ/ })).toBeChecked();
    expect(within(summary).getByText("Vận chuyển").nextSibling).toHaveTextContent(/35\.000/);
  });

  it("gives the selected shipping card the brand border and a minimum height of 56px", async () => {
    await renderView();
    const card = screen.getByRole("radio", { name: /Giao tiêu chuẩn/ }).closest("label")!;
    expect(card.className).toContain("min-h-14");
    expect(card.className).toContain("border-brand");
    expect(card.className).toContain("bg-brand-tint");
  });

  it("selects COD by default and shows the artboard descriptions", async () => {
    await renderView();
    await screen.findByRole("radio", { name: /Thanh toán khi nhận hàng/ });
    expect(screen.getByRole("radio", { name: /Thanh toán khi nhận hàng/ })).toBeChecked();
    expect(screen.getByText("Trả tiền mặt khi nhận")).toBeInTheDocument();
    expect(screen.getByText("Chuyển sang ứng dụng ví để xác nhận")).toBeInTheDocument();
    expect(screen.getByText("Hỗ trợ trả góp 0%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Ví điện tử/ }));
    expect(screen.getByRole("radio", { name: /Ví điện tử/ })).toBeChecked();
  });

  it("is keyboard operable", async () => {
    await renderView();
    const standard = screen.getByRole("radio", { name: /Giao tiêu chuẩn/ });
    act(() => standard.focus());
    await userEvent.keyboard("{ArrowDown}");
    const express = screen.getByRole("radio", { name: /Giao hỏa tốc 2 giờ/ });
    expect(express).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(express).toBeChecked();
  });

  it("disables an unavailable method with its reason (cardUnavailable)", async () => {
    server.use(...checkoutOverrides.cardUnavailable);
    await renderView();
    const card = await screen.findByRole("radio", { name: /Thẻ/ });
    expect(card).toBeDisabled();
    expect(screen.getByText("Tạm thời không khả dụng")).toBeInTheDocument();
    await userEvent.click(card);
    expect(screen.getByRole("radio", { name: /Thanh toán khi nhận hàng/ })).toBeChecked();
  });
});

describe("checkout demo payment outcome", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("offers the three outcomes when the flag is 1", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS", "1");
    await renderView();
    const select = await screen.findByLabelText("Kết quả thanh toán (demo)");
    const options = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Thành công", "Thất bại", "Quá thời gian"]);
    await userEvent.selectOptions(select, "Thất bại");
    expect(select).toHaveValue("fail");
  });

  it("is absent without the flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_PAYMENT_CONTROLS", "");
    await renderView();
    await screen.findByRole("radio", { name: /Thanh toán khi nhận hàng/ });
    expect(screen.queryByLabelText("Kết quả thanh toán (demo)")).not.toBeInTheDocument();
  });
});
