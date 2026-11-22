import { render, screen } from "@testing-library/react";

import { AccountView } from "./account-view";

describe("AccountView", () => {
  it("renders the h1 and both slots without fetching", () => {
    render(
      <AccountView
        profileSlot={<p data-testid="profile">profile</p>}
        logoutSlot={<button type="button">out</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Tài khoản của tôi" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("profile")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "out" })).toBeInTheDocument();
  });
});
