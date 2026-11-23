import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cartOverrides } from "@mocks/cart-handlers";
import { server } from "@mocks/node";

import { cartKeys, cartQueries } from "../queries";
import { AddToCartButton } from "./add-to-cart-button";
import { CartBadge } from "./cart-badge";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function setup(props: { quantity?: number; disabled?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CartBadge />
      <AddToCartButton sku="SKU-1" quantity={props.quantity ?? 2} disabled={props.disabled} />
    </QueryClientProvider>,
  );
  return client;
}

afterEach(() => vi.clearAllMocks());

describe("AddToCartButton", () => {
  it("is a real 44 px button labelled Thêm vào giỏ, disabled when out of stock", () => {
    setup({ disabled: true });
    const button = screen.getByRole("button", { name: "Thêm vào giỏ" });
    expect(button).toBeDisabled();
    expect(button.className).toContain("h-touch");
  });

  it("shows the new count and the toast while the request is still pending", async () => {
    server.use(cartOverrides.delayedAdd(400));
    setup({ quantity: 2 });
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("3");

    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));

    await waitFor(() => expect(screen.getByTestId("cart-count")).toHaveTextContent("5"));
    expect(toast.success).toHaveBeenCalledWith(
      "Đã thêm 2 sản phẩm vào giỏ",
      expect.objectContaining({ description: expect.anything() }),
    );
    const { description } = vi.mocked(toast.success).mock.calls[0]?.[1] ?? {};
    render(<>{description as ReactNode}</>);
    expect(screen.getByRole("link", { name: "Xem giỏ" })).toHaveAttribute("href", "/cart");
  });

  it("posts the sku and quantity", async () => {
    let body: unknown;
    server.use(
      http.post("*/api/cart/items", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          items: [],
          itemCount: 5,
          subtotal: { amount: 0, currency: "VND" },
          updatedAt: "2026-01-01T00:00:00Z",
        });
      }),
    );
    setup({ quantity: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    await waitFor(() => expect(body).toEqual({ sku: "SKU-1", quantity: 2 }));
  });

  it.each([
    ["addOutOfStock", "Sản phẩm không đủ số lượng trong kho."],
    ["addQtyLimit", "Bạn đã đạt số lượng tối đa cho sản phẩm này."],
    ["addUnavailable", "Hệ thống đang quá tải. Vui lòng thử lại sau."],
  ] as const)("restores the summary and shows the mapped message on %s", async (name, message) => {
    server.use(cartOverrides[name]);
    const client = setup({ quantity: 2 });
    expect(await screen.findByTestId("cart-count")).toHaveTextContent("3");
    // Keep the summary stale-proof so only the rollback is observed.
    client.setQueryDefaults(cartKeys.summary(), { staleTime: Infinity });
    const previous = client.getQueryData(cartKeys.summary());

    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(client.getQueryData(cartKeys.summary())).toEqual(previous);
  });

  it("invalidates the cart queries when the request settles", async () => {
    const client = setup();
    await screen.findByTestId("cart-count");
    const spy = vi.spyOn(client, "invalidateQueries");
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: cartKeys.all }));
  });

  it("does not debounce: two quick clicks send two requests", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/cart/items", async () => {
        calls += 1;
        return HttpResponse.json({
          items: [],
          itemCount: 5,
          subtotal: { amount: 0, currency: "VND" },
          updatedAt: "2026-01-01T00:00:00Z",
        });
      }),
    );
    setup();
    const button = screen.getByRole("button", { name: "Thêm vào giỏ" });
    await userEvent.click(button);
    await userEvent.click(button);
    await waitFor(() => expect(calls).toBe(2));
  });

  it("uses the shared summary query options", () => {
    expect(cartQueries.summary().queryKey).toEqual(cartKeys.summary());
  });
});
