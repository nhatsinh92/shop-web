import { render, screen, within } from "@testing-library/react";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("renders the logo, a labelled search field and the category navigation", () => {
    render(<SiteHeader cartSlot={<a href="/cart">Giỏ hàng</a>} />);

    expect(screen.getByRole("link", { name: "Mây." })).toHaveAttribute("href", "/");
    expect(screen.getByRole("searchbox", { name: "Tìm kiếm sản phẩm" })).toBeInTheDocument();
    const categories = screen.getByRole("navigation", { name: "Danh mục" });
    expect(within(categories).getAllByRole("link")).toHaveLength(7);
  });

  it("renders the cart slot inside the account navigation", () => {
    render(<SiteHeader cartSlot={<a href="/cart">Giỏ hàng</a>} />);

    const account = screen.getByRole("navigation", { name: "Tài khoản" });
    expect(within(account).getByRole("link", { name: "Giỏ hàng" })).toBeInTheDocument();
  });
});
