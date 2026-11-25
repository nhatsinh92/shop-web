import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";

import { cartKeys } from "@/features/cart/client";
import { checkoutOverrides } from "@mocks/checkout-handlers";
import { server } from "@mocks/node";

import { CheckoutStart } from "./checkout-start";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("CheckoutStart", () => {
  it("sends the selected cart lines and invalidates the cart after a 409", async () => {
    server.use(checkoutOverrides.reservationOutOfStock);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(
      <QueryClientProvider client={client}>
        <CheckoutStart />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/cart"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: cartKeys.all });
  });
});
