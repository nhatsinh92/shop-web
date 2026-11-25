import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act } from "react";

import { server } from "@mocks/node";
import { clearCartCount, writeCartCount } from "@/lib/hints/cart-count";

import { cartKeys } from "../queries";
import { CartBadge } from "./cart-badge";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function ui(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <CartBadge />
    </QueryClientProvider>
  );
}

beforeEach(() => clearCartCount());
afterAll(() => clearCartCount());

describe("CartBadge with the cart_count hint", () => {
  it("prefers the summary data over the hint", async () => {
    writeCartCount(7);
    render(ui(makeClient()));
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Giỏ hàng, 3 sản phẩm" })).toBeInTheDocument();
  });

  it("shows the hint while the summary is pending, without caching it", () => {
    writeCartCount(7);
    server.use(http.get("*/api/cart/summary", () => new Promise(() => undefined)));
    const client = makeClient();
    render(ui(client));
    expect(screen.getByTestId("cart-count")).toHaveTextContent("7");
    expect(client.getQueryData(cartKeys.summary())).toBeUndefined();
  });

  it("shows the hint after a 503", async () => {
    writeCartCount(7);
    server.use(http.get("*/api/cart/summary", () => new HttpResponse(null, { status: 503 })));
    const client = makeClient();
    render(ui(client));
    await vi.waitFor(() => expect(client.getQueryState(cartKeys.summary())?.status).toBe("error"));
    expect(screen.getByRole("link", { name: "Giỏ hàng, 7 sản phẩm" })).toBeInTheDocument();
  });

  it("caps the hint at 99+", () => {
    writeCartCount(150);
    server.use(http.get("*/api/cart/summary", () => new Promise(() => undefined)));
    render(ui(makeClient()));
    expect(screen.getByTestId("cart-count")).toHaveTextContent("99+");
    expect(screen.getByRole("link", { name: "Giỏ hàng, 99+ sản phẩm" })).toBeInTheDocument();
  });

  it("shows no badge without a hint while pending", () => {
    server.use(http.get("*/api/cart/summary", () => new Promise(() => undefined)));
    render(ui(makeClient()));
    expect(screen.queryByTestId("cart-count")).not.toBeInTheDocument();
  });

  it("hydrates a server-rendered badge with a hint cookie without warnings", async () => {
    server.use(http.get("*/api/cart/summary", () => new Promise(() => undefined)));
    const html = renderToString(ui(makeClient()));
    expect(html).not.toContain("cart-count");
    writeCartCount(7);
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => {
      hydrateRoot(container, ui(makeClient()));
    });
    expect(spy).not.toHaveBeenCalled();
    expect(container.querySelector("[data-testid=cart-count]")?.textContent).toBe("7");
    spy.mockRestore();
    container.remove();
  });
});
