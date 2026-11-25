import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { cartFixture, emptyCartFixture } from "@mocks/fixtures/cart";

import { cartQueries } from "./queries";
import { resetCartSelectionHydration, useCartSelectionStore } from "./stores/cart-selection-store";
import { useSelectedCheckoutLines } from "./use-selected-checkout-lines";

import type { Cart } from "./api";
import type { ReactNode } from "react";

beforeEach(() => {
  sessionStorage.clear();
  resetCartSelectionHydration();
  useCartSelectionStore.setState({ selected: [], known: [] });
});

function setup(cart?: Cart, restoring = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cart) client.setQueryData(cartQueries.mine().queryKey, cart);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={restoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
  return renderHook(() => useSelectedCheckoutLines(), { wrapper });
}

describe("useSelectedCheckoutLines", () => {
  it("returns selected available lines in cart order as {sku, name, quantity, unitPrice}", async () => {
    const cart: Cart = {
      ...cartFixture,
      items: cartFixture.items.map((item, i) => (i === 1 ? { ...item, available: false } : item)),
    };
    const { result } = setup(cart);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    const expected = cart.items
      .filter((item) => item.available)
      .map(({ sku, name, quantity, unitPrice }) => ({ sku, name, quantity, unitPrice }));
    expect(expected.length).toBeLessThan(cart.items.length);
    expect(result.current.lines).toEqual(expected);
  });

  it("omits a line the shopper deselected", async () => {
    const first = cartFixture.items[0];
    if (!first) throw new Error("fixture");
    useCartSelectionStore.getState().sync(cartFixture.items.map((i) => i.sku));
    useCartSelectionStore.getState().setSelected(first.sku, false);
    const { result } = setup(cartFixture);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.lines.map((l) => l.sku)).not.toContain(first.sku);
    expect(result.current.lines.length).toBeGreaterThan(0);
  });

  it("is pending with no lines until the cart query has data", () => {
    const { result } = setup(undefined);
    expect(result.current).toEqual({ lines: [], isPending: true });
  });

  it("is pending while the query cache restores", () => {
    const { result } = setup(cartFixture, true);
    expect(result.current).toEqual({ lines: [], isPending: true });
  });

  it("is pending until the selection store has hydrated", async () => {
    useCartSelectionStore.setState({ selected: [], known: [] });
    const { result } = setup(cartFixture);
    // Before the effect runs hydration is not finished; lines must never be empty-but-settled.
    expect(result.current.isPending === false || result.current.lines.length === 0).toBe(true);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    await act(async () => {});
    expect(result.current.lines.length).toBeGreaterThan(0);
  });

  it("returns no lines for an empty cart", async () => {
    const { result } = setup(emptyCartFixture);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current).toEqual({ lines: [], isPending: false });
  });

  it("returns no lines when no available line is selected", async () => {
    const skus = cartFixture.items.map((i) => i.sku);
    useCartSelectionStore.getState().sync(skus);
    skus.forEach((sku) => useCartSelectionStore.getState().setSelected(sku, false));
    const { result } = setup(cartFixture);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current).toEqual({ lines: [], isPending: false });
  });
});
