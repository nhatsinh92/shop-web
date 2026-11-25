import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { cartKeys } from "@/features/cart/client";
import { server } from "@mocks/node";

import { CheckoutFormHost } from "./checkout-form-host";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

async function setup() {
  const res = await fetch("http://localhost/api/checkout/reservations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [{ sku: "SKU-ANC-PRO-BLK", quantity: 1 }] }),
  });
  const { id } = await res.json();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <CheckoutFormHost reservationId={id} />
    </QueryClientProvider>,
  );
  await screen.findByRole("radio", { name: /Giao tiêu chuẩn/ });
  const set = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set("Họ và tên", "Nguyễn An");
  set("Số điện thoại", "0901234567");
  set("Địa chỉ", "12 Lê Lợi");
  set("Phường/Xã", "Bến Nghé");
  set("Tỉnh/Thành phố", "TP. Hồ Chí Minh");
  return invalidate;
}

describe("CheckoutFormHost after an order", () => {
  it("removes each ordered SKU from the cart and invalidates the cart queries", async () => {
    const deleted: string[] = [];
    server.use(
      http.delete("*/api/cart/items/:sku", ({ params }) => {
        deleted.push(String(params.sku));
        return HttpResponse.json({ items: [], itemCount: 0 });
      }),
    );
    const invalidate = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await screen.findByText("Đặt hàng thành công");
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: cartKeys.all }));
    expect(deleted).toEqual(["SKU-ANC-PRO-BLK"]);
  });

  it("still shows success when a delete fails", async () => {
    server.use(http.delete("*/api/cart/items/:sku", () => HttpResponse.error()));
    const invalidate = await setup();
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" }));
    expect(await screen.findByText("Đặt hàng thành công")).toBeVisible();
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
  });
});
