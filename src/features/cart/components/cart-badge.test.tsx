import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";

import { server } from "@mocks/node";

import { CartBadge } from "./cart-badge";

function renderWithQueryClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("CartBadge", () => {
  it("shows the item count from the cart summary", async () => {
    renderWithQueryClient(<CartBadge />);

    expect(await screen.findByTestId("cart-count")).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Giỏ hàng, 3 sản phẩm" })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("shows no badge when the cart is empty", async () => {
    server.use(http.get("*/api/cart/summary", () => HttpResponse.json({ itemCount: 0 })));
    renderWithQueryClient(<CartBadge />);

    expect(await screen.findByRole("link", { name: "Giỏ hàng" })).toBeInTheDocument();
    expect(screen.queryByTestId("cart-count")).not.toBeInTheDocument();
  });

  it("keeps the cart link usable when the request fails", async () => {
    server.use(http.get("*/api/cart/summary", () => new HttpResponse(null, { status: 503 })));
    renderWithQueryClient(<CartBadge />);

    expect(await screen.findByRole("link", { name: "Giỏ hàng" })).toBeInTheDocument();
    expect(screen.queryByTestId("cart-count")).not.toBeInTheDocument();
  });
});
