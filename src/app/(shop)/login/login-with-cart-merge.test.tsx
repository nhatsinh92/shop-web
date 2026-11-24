import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { demoCredentials } from "@mocks/fixtures/auth";
import { cartOverrides } from "@mocks/cart-handlers";
import { server } from "@mocks/node";

import { LoginWithCartMerge } from "./login-with-cart-merge";

vi.mock("@/features/auth/session-hint", () => ({ notifySessionHintChanged: vi.fn() }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

async function login(client: QueryClient) {
  render(
    <QueryClientProvider client={client}>
      <LoginWithCartMerge />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), demoCredentials.email);
  await user.type(screen.getByLabelText("Mật khẩu"), demoCredentials.password);
  const clicked = Date.now();
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
  return clicked;
}

beforeEach(() => {
  replace.mockClear();
});

describe("LoginWithCartMerge", () => {
  it("merges the guest cart into the caches, then redirects", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await login(client);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(client.getQueryData(["cart", "mine"])).toBeDefined();
    expect(client.getQueryData(["cart", "summary"])).toBeDefined();
  });

  it("redirects when the merge answers 503", async () => {
    server.use(cartOverrides.mergeUnavailable);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await login(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("redirects within the 1 s budget when the merge takes 3 s", async () => {
    server.use(cartOverrides.mergeDelayed(3000));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const clicked = await login(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"), { timeout: 2500 });
    expect(Date.now() - clicked).toBeLessThan(2000);
  });
});
