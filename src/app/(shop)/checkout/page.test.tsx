import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";

vi.mock("@/features/checkout", () => ({
  CheckoutHeader: () => (
    <header>
      <p>Thanh toán</p>
      <ol aria-label="Các bước">
        <li aria-current="step">2 Thông tin &amp; thanh toán</li>
      </ol>
    </header>
  ),
  CheckoutSection: ({ reservationId }: { reservationId: string }) => <p>section {reservationId}</p>,
  CheckoutSkeleton: () => <p>skeleton</p>,
  CheckoutView: () => null,
}));
vi.mock("./checkout-start", () => ({ CheckoutStart: () => <p>start</p> }));

import { CheckoutContent } from "./checkout-content";
import CheckoutPage from "./page";

const ID = "00000000-0000-4000-8000-000000000001";
const strip = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("checkout page", () => {
  it("renders the header and step bar in the shell while the hole is pending", () => {
    render(<CheckoutPage searchParams={new Promise(() => {})} />);
    expect(screen.getByText("Thanh toán")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Các bước" })).toBeInTheDocument();
    expect(screen.getByText("skeleton")).toBeInTheDocument();
  });

  it("starts checkout without a valid reservation id", async () => {
    for (const reservation of [undefined, "nope"]) {
      const { unmount } = render(
        await CheckoutContent({ searchParams: Promise.resolve({ reservation }) }),
      );
      expect(screen.getByText("start")).toBeInTheDocument();
      unmount();
    }
  });

  it("streams the section for a valid reservation id", async () => {
    render(await CheckoutContent({ searchParams: Promise.resolve({ reservation: [ID] }) }));
    expect(screen.getByText(`section ${ID}`)).toBeInTheDocument();
  });

  it("reads searchParams only in CheckoutContent and never uses 'use cache'", () => {
    const page = strip("src/app/(shop)/checkout/page.tsx");
    expect(page).not.toMatch(/use cache|cookies\(|headers\(|await searchParams/);
    expect(strip("src/app/(shop)/checkout/checkout-content.tsx")).toMatch(/await searchParams/);
  });
});
