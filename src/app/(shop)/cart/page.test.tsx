import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/cart", () => ({
  CartPageShell: ({ summarySlot }: { summarySlot?: React.ReactNode }) => (
    <aside aria-label="summary">{summarySlot}</aside>
  ),
  CartSection: () => null,
  CartSkeleton: () => null,
  CartView: () => null,
  CartSummaryPanel: () => <p>summary panel</p>,
}));

import CartPage from "./page";

describe("cart page", () => {
  it("passes <CartSummaryPanel /> as the shell's summarySlot", () => {
    render(<CartPage />);
    expect(screen.getByLabelText("summary")).toHaveTextContent("summary panel");
  });

  it("reads no cookies, headers or searchParams itself", () => {
    const raw = readFileSync(join(process.cwd(), "src/app/(shop)/cart/page.tsx"), "utf8");
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/cookies\(|headers\(|searchParams/);
  });
});
