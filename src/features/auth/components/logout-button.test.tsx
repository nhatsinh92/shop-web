import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";

import { server } from "@mocks/node";

import { LogoutButton } from "./logout-button";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe("LogoutButton", () => {
  it("is a real touch-sized button and sends one request on a double click", async () => {
    let calls = 0;
    server.use(
      http.post("*/api/auth/logout", async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 50));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LogoutButton />
      </QueryClientProvider>,
    );
    const button = screen.getByRole("button", { name: "Đăng xuất" });
    expect(button).toHaveClass("h-touch");
    await userEvent.dblClick(button);
    expect(button).toBeDisabled();
    await waitFor(() => expect(button).toBeEnabled());
    expect(calls).toBe(1);
  });
});
