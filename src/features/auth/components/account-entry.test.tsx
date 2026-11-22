import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { notifySessionHintChanged } from "../session-hint";
import { AccountEntry } from "./account-entry";

afterEach(() => {
  document.cookie = "logged_in=; Max-Age=0; path=/";
});

describe("AccountEntry", () => {
  it("links guests to /login", () => {
    render(<AccountEntry />);
    const link = screen.getByRole("link", { name: "Đăng nhập" });
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveClass("min-h-touch");
  });

  it("links signed-in users to /account", () => {
    document.cookie = "logged_in=1; path=/";
    render(<AccountEntry />);
    expect(screen.getByRole("link", { name: "Tài khoản" })).toHaveAttribute("href", "/account");
  });

  it("re-renders without a reload when the hint changes", () => {
    render(<AccountEntry />);
    expect(screen.getByRole("link", { name: "Đăng nhập" })).toBeInTheDocument();
    document.cookie = "logged_in=1; path=/";
    act(() => notifySessionHintChanged());
    expect(screen.getByRole("link", { name: "Tài khoản" })).toBeInTheDocument();
  });
});
