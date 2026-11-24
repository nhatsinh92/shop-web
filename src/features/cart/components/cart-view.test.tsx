import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { cartFixture, emptyCartFixture } from "@mocks/fixtures/cart";
import { cartOverrides } from "@mocks/cart-handlers";
import { server } from "@mocks/node";

import { cartKeys } from "../queries";
import { CartView } from "./cart-view";

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
}

function view(client: QueryClient, restoring = false) {
  return (
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={restoring}>
        <CartView />
      </IsRestoringProvider>
    </QueryClientProvider>
  );
}

const skeleton = () => screen.queryByText("Đang tải giỏ hàng");

describe("CartView", () => {
  it("renders hydrated lines on the first render without a skeleton", () => {
    const client = makeClient();
    client.setQueryData(cartKeys.mine(), cartFixture);
    render(view(client));
    expect(skeleton()).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(cartFixture.items.length);
  });

  it("shows no skeleton while restoring and the restored lines afterwards", () => {
    const client = makeClient();
    const { rerender } = render(view(client, true));
    expect(skeleton()).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    client.setQueryData(cartKeys.mine(), cartFixture);
    rerender(view(client, false));
    expect(screen.getAllByRole("article")).toHaveLength(cartFixture.items.length);
  });

  it("shows the skeleton until the first fetch resolves with nothing hydrated or persisted", async () => {
    server.use(cartOverrides.slowCart(150));
    render(view(makeClient()));
    expect(skeleton()).toBeInTheDocument();
    expect(await screen.findAllByRole("article")).toHaveLength(cartFixture.items.length);
    expect(skeleton()).not.toBeInTheDocument();
  });

  it("shows the stale banner, saved lines and the provisional total note when the query fails with data", async () => {
    server.use(cartOverrides.cartUnavailable);
    const client = makeClient();
    client.setQueryData(cartKeys.mine(), cartFixture);
    render(view(client));

    expect(
      await screen.findByText(
        "Đang hiển thị giỏ hàng đã lưu. Giá và tồn kho sẽ được xác nhận khi thanh toán.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(cartFixture.items.length);
    expect(screen.getByText("Tổng tiền tạm tính theo giá đã lưu")).toBeInTheDocument();

    let calls = 0;
    server.use(
      http.get("*/api/cart", () => {
        calls += 1;
        return HttpResponse.json(cartFixture);
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("shows the empty-cart frame with the error message and a retry when it fails without data", async () => {
    server.use(cartOverrides.cartUnavailable);
    render(view(makeClient()));
    expect(
      await screen.findByText("Hệ thống đang quá tải. Vui lòng thử lại sau."),
    ).toBeInTheDocument();
    expect(screen.getByText("Giỏ hàng đang trống")).toBeInTheDocument();

    server.use(http.get("*/api/cart", () => HttpResponse.json(cartFixture)));
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findAllByRole("article")).toHaveLength(cartFixture.items.length);
  });

  it("shows the empty state with a link to / for an empty cart", async () => {
    server.use(cartOverrides.emptyCart);
    render(view(makeClient()));
    expect(await screen.findByText("Giỏ hàng đang trống")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Săn deal 12.12" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
    expect(emptyCartFixture.items).toHaveLength(0);
  });

  it("renders the ANC Pro line with prices, link, stock label and total", () => {
    const client = makeClient();
    client.setQueryData(cartKeys.mine(), cartFixture);
    render(view(client));
    const line = cartFixture.items[0]!;
    const article = screen.getAllByRole("article")[0]!;
    expect(article).toHaveTextContent("890.000₫");
    expect(article).toHaveTextContent("1.790.000₫");
    expect(article).toHaveTextContent("Sắp hết");
    expect(article).toHaveTextContent(line.variantLabel!);
    expect(screen.getByRole("link", { name: line.name })).toHaveAttribute(
      "href",
      `/product/${line.slug}`,
    );
    expect(screen.getAllByText("Còn hàng")).toHaveLength(2);
  });

  it("labels an unavailable line Hết hàng", () => {
    const client = makeClient();
    client.setQueryData(cartKeys.mine(), {
      ...cartFixture,
      items: [{ ...cartFixture.items[1]!, available: false }],
    });
    render(view(client));
    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
    expect(screen.queryByText("Còn hàng")).not.toBeInTheDocument();
  });
});
