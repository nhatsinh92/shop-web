import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";

import { demoCredentials } from "@mocks/fixtures/auth";
import { authOverrides } from "@mocks/auth-handlers";
import { server } from "@mocks/node";

import { LoginForm } from "./login-form";

const replace = vi.fn();
let nextParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(nextParam ? { next: nextParam } : {}),
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <LoginForm />
    </QueryClientProvider>,
  );
  return { invalidate, user: userEvent.setup() };
}

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Mật khẩu"), password);
}

beforeEach(() => {
  replace.mockClear();
  nextParam = null;
});

describe("LoginForm", () => {
  it("has labelled fields with autocomplete hints", () => {
    setup();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Mật khẩu")).toHaveAttribute("autocomplete", "current-password");
  });

  it("shows field errors linked with aria-describedby", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    const email = screen.getByLabelText("Email");
    const error = await screen.findByText("Vui lòng nhập email.");
    expect(email).toHaveAttribute("aria-describedby", error.id);
    expect(screen.getByText("Vui lòng nhập mật khẩu.")).toBeInTheDocument();
  });

  it("invalidates auth, notifies and redirects to a safe next path on success", async () => {
    nextParam = "/account";
    const { user, invalidate } = setup();
    await fill(user, demoCredentials.email, demoCredentials.password);
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["auth"] });
  });

  it("redirects to / when next is unsafe", async () => {
    nextParam = "//evil.example";
    const { user } = setup();
    await fill(user, demoCredentials.email, demoCredentials.password);
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("shows the invalid credentials message in an alert", async () => {
    const { user } = setup();
    await fill(user, "demo@may.vn", "wrong");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Email hoặc mật khẩu không đúng.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Email hoặc mật khẩu không đúng.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the rate limited message", async () => {
    server.use(authOverrides.loginRateLimited);
    const { user } = setup();
    await fill(user, "demo@may.vn", "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
    );
  });

  it("sets 400 field errors on their fields", async () => {
    server.use(
      http.post("*/api/auth/login", () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Bad",
            status: 400,
            code: "VALIDATION_FAILED",
            errors: [{ field: "email", code: "invalid", message: "Email sai định dạng." }],
          },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const { user } = setup();
    await fill(user, "demo@may.vn", "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Email sai định dạng.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows messageFor(error) for other errors", async () => {
    server.use(http.post("*/api/auth/login", () => new HttpResponse(null, { status: 500 })));
    const { user } = setup();
    await fill(user, "demo@may.vn", "x");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Đã có lỗi xảy ra.");
  });

  it("sends one request on a double click", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/auth/login", async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json({
          id: "x",
          email: "a@b.vn",
          displayName: "A",
          memberTier: "GOLD",
        });
      }),
    );
    const { user } = setup();
    await fill(user, "demo@may.vn", "x");
    const button = screen.getByRole("button", { name: "Đăng nhập" });
    await user.dblClick(button);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(calls).toBe(1);
  });
});
