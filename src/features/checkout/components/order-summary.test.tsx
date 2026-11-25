import { render, screen, within } from "@testing-library/react";

import { buildReservation, reservationItem, vnd } from "@mocks/fixtures/checkout";

import { saveCartPrices } from "../cart-prices";
import { OrderSummary } from "./order-summary";

const ID = "6f1c1f0e-7a3e-4a53-9a55-0d6c2a3f9a11";
const FUTURE = "2030-01-01T00:00:00Z";

function reservationOf(...lines: Array<[string, number, number?]>) {
  const items = lines.map(([sku, quantity, expected]) => {
    const item = reservationItem(sku, quantity, expected);
    if (!item) throw new Error(`unknown fixture SKU ${sku}`);
    return item;
  });
  return buildReservation(ID, items, FUTURE);
}

describe("OrderSummary", () => {
  beforeEach(() => sessionStorage.clear());

  it("lists the lines with the edit link and the confirmed notice", () => {
    const reservation = reservationOf(["SKU-ANC-PRO-BLK", 2]);
    render(<OrderSummary reservation={reservation} shippingFee={0} />);
    expect(screen.getByText("Đơn hàng (1 sản phẩm)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sửa" })).toHaveAttribute("href", "/cart");
    const item = reservation.items[0]!;
    expect(screen.getByText(item.name)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`x2$`))).toBeInTheDocument();
    expect(screen.getByText("Giá và tồn kho đã được xác nhận")).toHaveClass("text-success");
    expect(screen.queryByText(/đã thay đổi so với giỏ hàng/)).not.toBeInTheDocument();
  });

  it("shows an info notice with the number of lines whose price changed", () => {
    const reservation = reservationOf(["SKU-ANC-PRO-BLK", 1, 1]);
    render(<OrderSummary reservation={reservation} shippingFee={0} />);
    expect(screen.getByText("Giá của 1 sản phẩm đã thay đổi so với giỏ hàng")).toHaveClass(
      "text-info",
    );
  });

  it("shows the member price row and the struck cart price when the stored price is higher", () => {
    const reservation = reservationOf(["SKU-ANC-PRO-BLK", 2]);
    const unit = reservation.items[0]!.unitPrice.amount;
    saveCartPrices(ID, [
      { sku: "SKU-ANC-PRO-BLK", quantity: 2, expectedUnitPrice: vnd(unit + 100_000) },
    ]);
    const { container } = render(<OrderSummary reservation={reservation} shippingFee={0} />);
    const row = screen.getByText("Giá thành viên").parentElement!;
    expect(row).toHaveClass("text-success");
    expect(within(row).getByText(/^−200\.000₫$/)).toBeInTheDocument();
    expect(container.querySelector("s")).toHaveTextContent(
      new Intl.NumberFormat("vi-VN").format((unit + 100_000) * 2) + "₫",
    );
  });

  it("omits the member price row and the strikes without the stored entry", () => {
    const { container } = render(
      <OrderSummary reservation={reservationOf(["SKU-ANC-PRO-BLK", 1])} shippingFee={0} />,
    );
    expect(screen.queryByText("Giá thành viên")).not.toBeInTheDocument();
    expect(container.querySelector("s")).toBeNull();
  });

  it("computes subtotal, free shipping and total, without a voucher row", () => {
    const reservation = reservationOf(["SKU-ANC-PRO-BLK", 1]);
    const subtotal = reservation.subtotal.amount;
    const { rerender } = render(<OrderSummary reservation={reservation} shippingFee={0} />);
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    expect(screen.queryByText(/voucher|mã giảm/i)).not.toBeInTheDocument();
    const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "₫";
    expect(screen.getByText("Tạm tính").nextSibling).toHaveTextContent(fmt(subtotal));
    rerender(<OrderSummary reservation={reservation} shippingFee={35_000} />);
    expect(screen.getByText("Vận chuyển").nextSibling).toHaveTextContent("35.000₫");
    expect(screen.getByText("Tổng thanh toán").nextSibling).toHaveTextContent(
      fmt(subtotal + 35_000),
    );
  });
});
