import { render, screen } from "@testing-library/react";

import { CartSkeleton } from "./cart-skeleton";

describe("CartSkeleton", () => {
  it("shows three line placeholders and a summary placeholder", () => {
    render(<CartSkeleton />);
    expect(screen.getAllByTestId("cart-skeleton-line")).toHaveLength(3);
    expect(screen.getByTestId("cart-skeleton-summary")).toBeInTheDocument();
  });

  it("has an accessible busy state", () => {
    const { container } = render(<CartSkeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Đang tải giỏ hàng")).toBeInTheDocument();
  });
});
