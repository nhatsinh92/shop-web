import { render, screen } from "@testing-library/react";

import { CategoryTiles } from "./category-tiles";

describe("CategoryTiles", () => {
  it("shows the six static tiles as non-link items", () => {
    render(<CategoryTiles />);
    expect(screen.getByRole("heading", { name: "Danh mục nổi bật" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Điện thoại",
      "Laptop",
      "Thời trang",
      "Nhà cửa",
      "Làm đẹp",
      "Mẹ & bé",
    ]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
