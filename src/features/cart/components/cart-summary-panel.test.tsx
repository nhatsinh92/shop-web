import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { buildCart, cartFixture, emptyCartFixture } from "@mocks/fixtures/cart";

import { cartQueries } from "../queries";
import { resetCartSelectionHydration, useCartSelectionStore } from "../stores/cart-selection-store";
import { CartSummaryPanel } from "./cart-summary-panel";
import { CartView } from "./cart-view";

import type { Cart } from "../api";

beforeEach(() => {
  sessionStorage.clear();
  resetCartSelectionHydration();
  useCartSelectionStore.setState({ selected: [], known: [] });
});

function setup(cart?: Cart, { withView = false, restoring = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cart) client.setQueryData(cartQueries.mine().queryKey, cart);
  render(
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={restoring}>
        <CartSummaryPanel />
        {withView && <CartView />}
      </IsRestoringProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe("CartSummaryPanel", () => {
  it("shows the artboard totals with everything selected", () => {
    setup(cartFixture);
    expect(screen.getByText("Tạm tính (4 sản phẩm)")).toBeInTheDocument();
    expect(screen.getByText("Phí vận chuyển")).toBeInTheDocument();
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    expect(screen.getByText("Tổng cộng")).toBeInTheDocument();
    expect(screen.getAllByText("2.418.000₫")).toHaveLength(2);
    expect(screen.getByText("Giá và tồn kho được xác nhận ở bước thanh toán")).toBeInTheDocument();
    expect(screen.queryByText(/voucher|mã giảm/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thanh toán" })).toHaveAttribute("href", "/checkout");
  });

  it("totals only the selected lines when one is unchecked", async () => {
    setup(cartFixture, { withView: true });
    await userEvent.click(screen.getAllByRole("checkbox", { name: /^Chọn / })[0]!);
    expect(screen.getByText("Tạm tính (3 sản phẩm)")).toBeInTheDocument();
  });

  it("excludes unavailable lines from the count and totals", () => {
    const [first, second] = cartFixture.items;
    if (!first || !second) throw new Error("fixture");
    setup(buildCart([first, { ...second, available: false }]));
    expect(screen.getByText("Tạm tính (1 sản phẩm)")).toBeInTheDocument();
    expect(screen.getAllByText("890.000₫").length).toBeGreaterThan(0);
  });

  it("disables 'Thanh toán' and shows 0₫ for an empty cart", () => {
    setup(emptyCartFixture);
    expect(screen.getAllByText("0₫").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Thanh toán" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thanh toán" })).toBeDisabled();
  });

  it("disables 'Thanh toán' when nothing is selected", async () => {
    setup(cartFixture, { withView: true });
    for (const box of await screen.findAllByRole("checkbox", { name: /^Chọn / })) {
      await userEvent.click(box);
    }
    expect(screen.getByRole("button", { name: "Thanh toán" })).toBeDisabled();
    expect(screen.getByText("Tạm tính (0 sản phẩm)")).toBeInTheDocument();
  });

  it("shows a skeleton and a disabled button, never 0₫, while the cart has no data", () => {
    setup(undefined, { restoring: true });
    expect(screen.getByTestId("cart-summary-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("0₫")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thanh toán" })).toBeDisabled();
  });
});
