import { render, screen } from "@testing-library/react";

import { ProductCard } from "./product-card";

const product = {
  slug: "tai-nghe",
  name: "Tai nghe ANC Pro",
  imageUrl: "https://placehold.co/800x800?text=tai-nghe-1",
  price: { amount: 1790000, currency: "VND" },
};

describe("ProductCard", () => {
  it("renders image, link, sale price, struck old price, badge and stock line", () => {
    render(
      <ProductCard
        product={product}
        salePrice={{ amount: 890000, currency: "VND" }}
        stockLine="Sắp hết"
      />,
    );
    expect(screen.getByRole("img", { name: "Tai nghe ANC Pro" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tai nghe ANC Pro" })).toHaveAttribute(
      "href",
      "/product/tai-nghe",
    );
    expect(screen.getByText("890.000₫")).toBeInTheDocument();
    expect(screen.getByText("1.790.000₫").tagName).toBe("S");
    expect(screen.getByText("-50%")).toBeInTheDocument();
    expect(screen.getByText("Sắp hết")).toBeInTheDocument();
  });

  it("uses listPrice as the struck price without a sale price", () => {
    render(
      <ProductCard product={{ ...product, listPrice: { amount: 2000000, currency: "VND" } }} />,
    );
    expect(screen.getByText("1.790.000₫")).toBeInTheDocument();
    expect(screen.getByText("2.000.000₫").tagName).toBe("S");
    expect(screen.getByText("-10%")).toBeInTheDocument();
  });

  it("renders a card without an old price, badge or stock line", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText("1.790.000₫")).toBeInTheDocument();
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
    expect(document.querySelector("s")).toBeNull();
  });
});
