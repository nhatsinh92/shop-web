import { render, screen } from "@testing-library/react";

import { CheckoutHeader } from "./checkout-header";
import { CheckoutConsumed, CheckoutNotFound } from "./checkout-states";

describe("checkout shell", () => {
  it("renders the brand, the title and the step bar with the current step marked", () => {
    render(<CheckoutHeader />);
    expect(screen.getByRole("link", { name: /Mây/ })).toHaveAttribute("href", "/");
    expect(screen.getByText("Thanh toán")).toBeInTheDocument();
    expect(screen.getByText("✓ Giỏ hàng")).toBeInTheDocument();
    expect(screen.getByText("2 Thông tin & thanh toán")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("3 Hoàn tất")).toBeInTheDocument();
  });

  it("renders the not-found and consumed states with their actions", () => {
    const { rerender } = render(<CheckoutNotFound />);
    expect(screen.getByRole("heading", { name: "Không tìm thấy phiên thanh toán" })).toBeVisible();
    rerender(<CheckoutConsumed />);
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });
});
