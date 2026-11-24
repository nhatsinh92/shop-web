import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { server } from "@mocks/node";

import { CartBadge } from "./cart-badge";

function renderBadge(itemCount: number) {
  server.use(http.get("*/api/cart/summary", () => HttpResponse.json({ itemCount })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CartBadge />
    </QueryClientProvider>,
  );
}

describe("CartBadge accessible name", () => {
  it("separates the visible text from the badge with whitespace", async () => {
    renderBadge(4);
    const link = await screen.findByRole("link", { name: "Giỏ hàng, 4 sản phẩm" });

    expect(link.textContent).toMatch(/Giỏ hàng\s+4$/);
  });

  it("uses the badge text in the name when there are more than 99 items", async () => {
    renderBadge(120);
    const link = await screen.findByRole("link", { name: "Giỏ hàng, 99+ sản phẩm" });

    expect(screen.getByTestId("cart-count")).toHaveTextContent("99+");
    expect(link.textContent).toMatch(/Giỏ hàng\s+99\+$/);
  });

  it("keeps the exact count in the name up to 99 items", async () => {
    renderBadge(99);

    expect(await screen.findByRole("link", { name: "Giỏ hàng, 99 sản phẩm" })).toBeInTheDocument();
    expect(screen.getByTestId("cart-count")).toHaveTextContent("99");
  });
});
