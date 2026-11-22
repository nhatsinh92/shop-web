import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { userProfileFixture } from "@mocks/fixtures/auth";
import { server } from "@mocks/node";

import { CurrentUserProfile } from "./current-user-profile";

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CurrentUserProfile />
    </QueryClientProvider>,
  );
}

describe("CurrentUserProfile", () => {
  // Node fetch sends no document cookies, so the signed-in state is a per-test handler.
  const signedIn = () =>
    server.use(http.get("*/api/auth/me", () => HttpResponse.json(userProfileFixture)));

  it("shows a skeleton while loading", () => {
    signedIn();
    renderProfile();
    expect(screen.getByTestId("profile-skeleton")).toBeInTheDocument();
  });

  it("renders name, email and the Vietnamese tier label on success", async () => {
    signedIn();
    renderProfile();
    expect(await screen.findByText(userProfileFixture.displayName)).toBeInTheDocument();
    expect(screen.getByText(userProfileFixture.email)).toBeInTheDocument();
    expect(screen.getByText("Thành viên Vàng")).toBeInTheDocument();
    expect(screen.queryByTestId("profile-skeleton")).not.toBeInTheDocument();
  });

  it.each([
    ["STANDARD", "Thành viên Tiêu chuẩn"],
    ["SILVER", "Thành viên Bạc"],
    ["PLATINUM", "Thành viên Bạch kim"],
  ] as const)("labels the %s tier", async (tier, label) => {
    server.use(
      http.get("*/api/auth/me", () =>
        HttpResponse.json({ ...userProfileFixture, memberTier: tier }),
      ),
    );
    renderProfile();
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("shows the message and a working retry button on a 503", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/auth/me", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              {
                type: "about:blank",
                title: "Unavailable",
                status: 503,
                code: "SERVICE_UNAVAILABLE",
              },
              { status: 503, headers: { "Content-Type": "application/problem+json" } },
            )
          : HttpResponse.json(userProfileFixture);
      }),
    );
    renderProfile();
    expect(
      await screen.findByText("Hệ thống đang quá tải. Vui lòng thử lại sau."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText(userProfileFixture.displayName)).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("keeps the skeleton on a 401 (the proxy redirects to /login)", async () => {
    renderProfile();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("profile-skeleton")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  });
});
