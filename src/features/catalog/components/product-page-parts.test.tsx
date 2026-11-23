import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { productDetailFixtures, productSummaryFixtures } from "../../../../mocks/fixtures/products";
import { getSimilarProducts } from "../catalog.server";
import { ProductBreadcrumb } from "./product-breadcrumb";
import { ProductDescription } from "./product-description";
import { ProductGallery } from "./product-gallery";
import { ProductHeading } from "./product-heading";
import { ProductServiceInfo } from "./product-service-info";
import { SimilarProducts } from "./similar-products";

vi.mock("../catalog.server", () => ({ getSimilarProducts: vi.fn() }));

const product = productDetailFixtures.find((p) => p.category.path.length === 2)!;

describe("ProductBreadcrumb", () => {
  it("shows home link, category path as plain text and the product name", () => {
    render(<ProductBreadcrumb categoryPath={product.category.path} productName={product.name} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trang chủ" })).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    for (const item of product.category.path) expect(screen.getByText(item.name)).toBeVisible();
    expect(screen.getByText(product.name)).toHaveAttribute("aria-current", "page");
  });
});

describe("ProductGallery", () => {
  it("shows the product images with the colour alt text and switches on thumbnail click", async () => {
    render(<ProductGallery images={product.images} colorName="Đen nhám" />);
    const main = screen.getByRole("img", { name: "Ảnh sản phẩm – Đen nhám" });
    expect(main.getAttribute("src")).toContain(encodeURIComponent(product.images[0]!.url));
    await userEvent.click(screen.getByRole("button", { name: "Ảnh 2" }));
    expect(
      screen.getByRole("img", { name: "Ảnh sản phẩm – Đen nhám" }).getAttribute("src"),
    ).toContain(encodeURIComponent(product.images[1]!.url));
  });
});

describe("ProductHeading", () => {
  it("shows brand line and name without rating, reviews or sold count", () => {
    render(<ProductHeading brand="Mây Audio" name="Tai nghe" />);
    expect(screen.getByRole("heading", { level: 1, name: "Tai nghe" })).toBeInTheDocument();
    expect(screen.getByText("Mây Audio · Chính hãng")).toBeInTheDocument();
    expect(screen.queryByText(/đánh giá|Đã bán/)).not.toBeInTheDocument();
  });
});

describe("ProductServiceInfo", () => {
  it("shows delivery, returns and warranty copy without a delivery date", () => {
    render(<ProductServiceInfo />);
    expect(screen.getByText("Giao hàng")).toBeInTheDocument();
    expect(screen.getByText("Freeship")).toBeInTheDocument();
    expect(screen.getByText("Miễn phí trong 15 ngày")).toBeInTheDocument();
    expect(screen.getByText("12 tháng chính hãng")).toBeInTheDocument();
    expect(screen.queryByText(/Nhận ngày/)).not.toBeInTheDocument();
  });
});

describe("ProductDescription", () => {
  it("renders the description as text, never as HTML", () => {
    render(<ProductDescription description="<b>bold</b> text" />);
    expect(screen.getByRole("heading", { name: "Mô tả sản phẩm" })).toBeInTheDocument();
    expect(screen.getByText("<b>bold</b> text")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });
});

describe("SimilarProducts", () => {
  it("renders one card per similar product, never the current one", async () => {
    const others = productSummaryFixtures.filter((p) => p.slug !== product.slug).slice(0, 5);
    vi.mocked(getSimilarProducts).mockResolvedValue(others);
    render(await SimilarProducts({ product }));
    expect(screen.getByRole("heading", { name: "Sản phẩm tương tự" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(screen.queryByText(product.name)).not.toBeInTheDocument();
  });

  it("renders nothing when there are no similar products", async () => {
    vi.mocked(getSimilarProducts).mockResolvedValue([]);
    const { container } = render(await SimilarProducts({ product }));
    expect(container).toBeEmptyDOMElement();
  });
});
