import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { cartOverrides, cartState } from "@mocks/cart-handlers";
import { cartFixture } from "@mocks/fixtures/cart";
import { server } from "@mocks/node";

import { cartKeys } from "../queries";
import { CartView } from "./cart-view";

import type { Cart, CartSummary } from "../api";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const [anc, keyboard, bottle] = cartFixture.items as [
  Cart["items"][number],
  Cart["items"][number],
  Cart["items"][number],
];

function setup(cart: Cart = cartFixture) {
  cartState.reset();
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  client.setQueryData(cartKeys.mine(), cart);
  client.setQueryData<CartSummary>(cartKeys.summary(), { itemCount: cart.itemCount });
  const requests: { method: string; url: string; body: unknown }[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "GET") return;
    requests.push({
      method: request.method,
      url: new URL(request.url).pathname,
      body: await request
        .clone()
        .json()
        .catch(() => null),
    });
  });
  const utils = render(
    <QueryClientProvider client={client}>
      <IsRestoringProvider value={false}>
        <CartView />
      </IsRestoringProvider>
    </QueryClientProvider>,
  );
  return { client, requests, ...utils };
}

const mine = (client: QueryClient) => client.getQueryData<Cart>(cartKeys.mine())!;
const plus = (name: string) => screen.getByRole("button", { name: `Tăng số lượng ${name}` });
const minus = (name: string) => screen.getByRole("button", { name: `Giảm số lượng ${name}` });

afterEach(() => {
  server.events.removeAllListeners();
  vi.mocked(toast.error).mockClear();
});

describe("cart quantity edits", () => {
  it("updates the cart, line total, item count, subtotal and badge before any request", () => {
    const { client, requests } = setup();
    fireEvent.click(plus(anc.name));
    const cart = mine(client);
    expect(cart.items[0]?.quantity).toBe(2);
    expect(cart.items[0]?.lineTotal.amount).toBe(2 * anc.unitPrice.amount);
    expect(cart.itemCount).toBe(cartFixture.itemCount + 1);
    expect(cart.subtotal.amount).toBe(cartFixture.subtotal.amount + anc.unitPrice.amount);
    expect(client.getQueryData<CartSummary>(cartKeys.summary())?.itemCount).toBe(
      cartFixture.itemCount + 1,
    );
    expect(requests).toHaveLength(0);
    expect(screen.getByText("Đang chờ…")).toBeInTheDocument();
  });

  it("sends exactly one PATCH with the final quantity for five clicks within the burst, one per SKU", async () => {
    server.use(...cartOverrides.statefulCart());
    const { requests } = setup();
    for (let i = 0; i < 5; i++) fireEvent.click(plus(anc.name));
    fireEvent.click(plus(keyboard.name));
    await waitFor(() => expect(requests).toHaveLength(2), { timeout: 2000 });
    await screen.findByText("Đã lưu");
    expect(requests.find((r) => r.url.endsWith(anc.sku))).toMatchObject({
      method: "PATCH",
      body: { quantity: 6 },
    });
    expect(requests.find((r) => r.url.endsWith(keyboard.sku))).toMatchObject({
      body: { quantity: 2 },
    });
  });

  it("shows Đang lưu… while the request is in flight, then Đã lưu", async () => {
    server.use(cartOverrides.patchDelayed(150));
    setup();
    fireEvent.click(plus(anc.name));
    expect(await screen.findByText("Đang lưu…", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(await screen.findByText("Đã lưu", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText(/debounce/i)).not.toBeInTheDocument();
  });

  it("ignores a response while a newer change for the SKU is pending", async () => {
    server.use(cartOverrides.patchDelayed(700));
    const { client, requests } = setup();
    fireEvent.click(plus(anc.name)); // quantity 2
    await waitFor(() => expect(requests).toHaveLength(1), { timeout: 2000 });
    fireEvent.click(plus(anc.name)); // quantity 3, second burst while the first is in flight
    await waitFor(() => expect(requests).toHaveLength(2), { timeout: 2000 });
    await screen.findByText("Đã lưu", {}, { timeout: 4000 });
    expect(requests.map((r) => (r.body as { quantity: number }).quantity)).toEqual([2, 3]);
    expect(mine(client).items[0]?.quantity).toBe(3);
  });

  it.each([
    ["patchQtyLimit", "Bạn đã đạt số lượng tối đa cho sản phẩm này."],
    ["patchUnavailable", "Hệ thống đang quá tải. Vui lòng thử lại sau."],
    ["patchOutOfStock", "Sản phẩm không đủ số lượng trong kho."],
  ] as const)("rolls back to the confirmed quantity and toasts on %s", async (name, message) => {
    server.use(cartOverrides[name]);
    const { client } = setup();
    fireEvent.click(plus(bottle.name));
    expect(mine(client).items[2]?.quantity).toBe(3);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message), { timeout: 2000 });
    expect(mine(client).items[2]?.quantity).toBe(2);
    expect(mine(client).itemCount).toBe(cartFixture.itemCount);
    expect(client.getQueryData<CartSummary>(cartKeys.summary())?.itemCount).toBe(
      cartFixture.itemCount,
    );
  });

  it("bounds the stepper to 1–10 and disables it on unavailable lines", () => {
    setup({
      ...cartFixture,
      items: [
        { ...anc, quantity: 10 },
        { ...keyboard, available: false },
        { ...bottle, quantity: 5 },
      ],
    });
    expect(plus(anc.name)).toBeDisabled();
    expect(minus(anc.name)).toBeEnabled();
    expect(minus(keyboard.name)).toBeDisabled();
    expect(plus(keyboard.name)).toBeDisabled();
    expect(plus(bottle.name)).toBeEnabled();
    expect(minus(bottle.name)).toBeEnabled();
  });

  it("disables minus at quantity 1", () => {
    setup();
    expect(minus(anc.name)).toBeDisabled();
  });

  it("removes a line optimistically, sends one DELETE, and keeps it removed", async () => {
    server.use(...cartOverrides.statefulCart());
    const { client, requests } = setup();
    await userEvent.click(screen.getByRole("button", { name: `Xóa ${keyboard.name}` }));
    expect(mine(client).items.map((l) => l.sku)).not.toContain(keyboard.sku);
    expect(screen.getAllByRole("article")).toHaveLength(2);
    await screen.findByText("Đã lưu");
    expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
    expect(mine(client).items).toHaveLength(2);
  });

  it("restores the removed line with a toast when the DELETE fails", async () => {
    const { http } = await import("msw");
    const { HttpResponse } = await import("msw");
    server.use(
      http.delete("*/api/cart/items/*", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Unavailable", status: 503, code: "SERVICE_UNAVAILABLE" },
          { status: 503, headers: { "content-type": "application/problem+json" } },
        ),
      ),
    );
    const { client } = setup();
    await userEvent.click(screen.getByRole("button", { name: `Xóa ${keyboard.name}` }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled(), { timeout: 2000 });
    expect(mine(client).items.map((l) => l.sku)).toEqual([anc.sku, keyboard.sku, bottle.sku]);
    expect(mine(client).itemCount).toBe(cartFixture.itemCount);
  });

  it("keeps the remove button enabled on an unavailable line", () => {
    setup({ ...cartFixture, items: [{ ...keyboard, available: false }] });
    expect(screen.getByRole("button", { name: `Xóa ${keyboard.name}` })).toBeEnabled();
  });

  it("clears pending timers on unmount", async () => {
    const { requests, unmount } = setup();
    fireEvent.click(plus(anc.name));
    unmount();
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(requests).toHaveLength(0);
  });

  it("sends pending changes with a keepalive PATCH on pagehide", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    setup();
    fireEvent.click(plus(anc.name));
    fireEvent.click(plus(anc.name));
    window.dispatchEvent(new Event("pagehide"));
    // MSW re-enters fetch with a Request object; only the page's own string-URL calls count.
    const own = fetchSpy.mock.calls.filter(([input]) => typeof input === "string");
    expect(own).toHaveLength(1);
    const [url, init] = own[0]!;
    expect(String(url)).toContain(`/api/cart/items/${anc.sku}`);
    expect(init).toMatchObject({ method: "PATCH", keepalive: true, credentials: "include" });
    expect(JSON.parse(String(init?.body))).toEqual({ quantity: 3 });
    fetchSpy.mockRestore();
  });
});
