import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { demoCredentials } from "@mocks/fixtures/auth";
import { authOverrides } from "@mocks/auth-handlers";
import { server } from "@mocks/node";

import { LoginForm } from "./login-form";

vi.mock("../session-hint", () => ({ notifySessionHintChanged: vi.fn() }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

async function submit(onLoggedIn?: () => Promise<void>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LoginForm onLoggedIn={onLoggedIn} />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), demoCredentials.email);
  await user.type(screen.getByLabelText("Mật khẩu"), demoCredentials.password);
  await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
}

beforeEach(() => {
  replace.mockClear();
});

describe("LoginForm onLoggedIn", () => {
  it("awaits a resolving callback before redirecting", async () => {
    let resolve: () => void = () => {};
    const onLoggedIn = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    await submit(onLoggedIn);
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledTimes(1));
    expect(replace).not.toHaveBeenCalled();
    resolve();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("warns and still redirects when the callback rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await submit(() => Promise.reject(new Error("merge failed")));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("redirects without a callback", async () => {
    await submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("never calls the callback when the login fails", async () => {
    server.use(authOverrides.loginRateLimited);
    const onLoggedIn = vi.fn(() => Promise.resolve());
    await submit(onLoggedIn);
    await screen.findByRole("alert");
    expect(onLoggedIn).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
