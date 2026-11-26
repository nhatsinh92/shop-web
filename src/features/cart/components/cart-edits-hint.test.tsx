import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { cartState } from "@mocks/cart-handlers";
import { buildCart, cartFixture } from "@mocks/fixtures/cart";
import { server } from "@mocks/node";
import { clearCartCount, readCartCount, writeCartCount } from "@/lib/hints/cart-count";

import { cartKeys } from "../queries";
import { QUANTITY_DEBOUNCE_MS } from "../use-debounced-quantity";
import { CartView } from "./cart-view";

import type { Cart } from "../api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const first = cartFixture.items[0]!;

function setup() {
  cartState.reset();
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  client.setQueryData(cartKeys.mine(), cartFixture);
  client.setQueryData(cartKeys.summary(), { itemCount: cartFixture.itemCount });
  render(
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={false}>
        <CartView />
      </IsRestoringProvider>
    </QueryClientProvider>,
  );
  return client;
}

const plus = () => screen.getByRole("button", { name: `Tăng số lượng ${first.name}` });
const confirmed = (itemCount: number): Cart => ({ ...buildCart(cartFixture.items), itemCount });

beforeEach(() => {
  clearCartCount();
  writeCartCount(cartFixture.itemCount);
});
afterAll(() => clearCartCount());

describe("cart_count hint through the real edit path", () => {
  it("keeps the hint while a quantity change is only optimistic", () => {
    const client = setup();
    fireEvent.click(plus());
    expect(client.getQueryData<Cart>(cartKeys.mine())?.itemCount).toBe(cartFixture.itemCount + 1);
    expect(readCartCount()).toBe(cartFixture.itemCount);
  });

  it("writes the server's itemCount after a successful PATCH", async () => {
    server.use(http.patch("*/api/cart/items/:sku", () => HttpResponse.json(confirmed(11))));
    setup();
    fireEvent.click(plus());
    await waitFor(() => expect(readCartCount()).toBe(11), {
      timeout: QUANTITY_DEBOUNCE_MS + 2000,
    });
  });

  it("writes the server's itemCount after a successful DELETE", async () => {
    server.use(http.delete("*/api/cart/items/:sku", () => HttpResponse.json(confirmed(2))));
    setup();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Xóa.*${first.name}`) }));
    await waitFor(() => expect(readCartCount()).toBe(2));
  });

  it("leaves the hint unchanged when the PATCH fails with 503, even after the optimistic update", async () => {
    server.use(http.patch("*/api/cart/items/:sku", () => new HttpResponse(null, { status: 503 })));
    const client = setup();
    fireEvent.click(plus());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, QUANTITY_DEBOUNCE_MS + 300));
    });
    expect(client.getQueryData<Cart>(cartKeys.mine())?.itemCount).toBe(cartFixture.itemCount);
    expect(readCartCount()).toBe(cartFixture.itemCount);
  });

  it("leaves the hint unchanged when the DELETE fails with 503", async () => {
    server.use(http.delete("*/api/cart/items/:sku", () => new HttpResponse(null, { status: 503 })));
    const client = setup();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Xóa.*${first.name}`) }));
    await waitFor(() =>
      expect(client.getQueryData<Cart>(cartKeys.mine())?.itemCount).toBe(cartFixture.itemCount),
    );
    expect(readCartCount()).toBe(cartFixture.itemCount);
  });
});
