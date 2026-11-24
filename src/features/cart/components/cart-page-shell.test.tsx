import { render, screen } from "@testing-library/react";

import { CartPageShell } from "./cart-page-shell";

describe("CartPageShell", () => {
  it("links 'Tiếp tục mua sắm' to / with a touch-sized target", () => {
    render(<CartPageShell cartViewSlot={<p>view</p>} />);
    const link = screen.getByRole("link", { name: /Tiếp tục mua sắm/ });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveClass("h-touch");
  });

  it("renders the cart view slot and the summary frame", () => {
    render(<CartPageShell cartViewSlot={<p>view</p>} />);
    expect(screen.getByText("view")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Tóm tắt đơn hàng" })).toBeInTheDocument();
  });
});
