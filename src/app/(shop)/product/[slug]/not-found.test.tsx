import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProductNotFound from "./not-found";

describe("product not-found page", () => {
  it("explains the problem and links back to the home page", () => {
    render(<ProductNotFound />);
    expect(screen.getByRole("heading", { name: "Không tìm thấy sản phẩm" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });
});
