import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import { cartFixture } from "@mocks/fixtures/cart";

const { getCartForRequest } = vi.hoisted(() => ({ getCartForRequest: vi.fn() }));
vi.mock("./cart.server", () => ({ getCartForRequest }));

import type { Cart } from "./api";
import { CartSection } from "./cart-section";
import { cartKeys } from "./queries";

function Probe() {
  const { data } = useQuery({
    queryKey: cartKeys.mine(),
    queryFn: (): Promise<Cart> => Promise.reject(new Error("not hydrated")),
    enabled: false,
  });
  return <p data-testid="probe">{data ? `items:${data.items.length}` : "empty"}</p>;
}

async function renderSection() {
  const ui = await CartSection({ children: <Probe /> });
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("CartSection", () => {
  it("hydrates the server cart into cartKeys.mine()", async () => {
    getCartForRequest.mockResolvedValue(cartFixture);
    await renderSection();
    expect(screen.getByTestId("probe")).toHaveTextContent(`items:${cartFixture.items.length}`);
  });

  it("hydrates nothing when the cart is null", async () => {
    getCartForRequest.mockResolvedValue(null);
    await renderSection();
    expect(screen.getByTestId("probe")).toHaveTextContent("empty");
  });
});
