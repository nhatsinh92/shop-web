import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFlashSale } from "../../../../mocks/fixtures/products";
import { getCurrentFlashSale } from "../catalog.server";
import { FlashSaleCountdown } from "./flash-sale-countdown";
import { FlashSaleSection, stockLine } from "./flash-sale-section";

vi.mock("../catalog.server", () => ({ getCurrentFlashSale: vi.fn() }));

const NOW = new Date("2026-12-12T10:00:00Z");

async function renderSection() {
  render(await FlashSaleSection());
}

describe("FlashSaleSection", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders one card per item with sale price, struck old price and discount", async () => {
    const sale = createFlashSale(NOW);
    vi.mocked(getCurrentFlashSale).mockResolvedValue(sale);
    await renderSection();

    expect(screen.getByRole("heading", { name: "Flash sale" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(sale.items.length);
    expect(screen.getByText("890.000₫")).toBeInTheDocument();
    expect(screen.getByText("1.790.000₫").tagName).toBe("S");
    expect(screen.getByText("-50%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem tất cả" })).toHaveAttribute("href", "/");
  });

  it("renders no section and no heading without a sale", async () => {
    vi.mocked(getCurrentFlashSale).mockResolvedValue(null);
    await renderSection();
    expect(screen.queryByRole("heading", { name: "Flash sale" })).not.toBeInTheDocument();
    expect(screen.queryByText("Kết thúc sau")).not.toBeInTheDocument();
  });

  it("counts down from the sale end time after mount", async () => {
    const sale = createFlashSale(NOW); // ends in 2 hours
    vi.mocked(getCurrentFlashSale).mockResolvedValue(sale);
    await renderSection();

    expect(screen.getByText("Kết thúc sau")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("02:00:00");
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent("01:58:59");
  });

  it("renders a static --:--:-- label on the server, before any clock runs", () => {
    const html = renderToString(
      <FlashSaleCountdown endsAt={new Date(NOW.getTime() + 7_200_000).toISOString()} action={null}>
        <div />
      </FlashSaleCountdown>,
    );
    expect(html).toContain("Kết thúc sau");
    expect(html.match(/--/g)).toHaveLength(3);
    expect(html.replace(/<[^>]*>/g, "")).not.toMatch(/\d/);
  });

  it("hides the section when the countdown reaches zero", async () => {
    const sale = { ...createFlashSale(NOW), endsAt: new Date(NOW.getTime() + 2000).toISOString() };
    vi.mocked(getCurrentFlashSale).mockResolvedValue(sale);
    await renderSection();
    expect(screen.getByRole("heading", { name: "Flash sale" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("heading", { name: "Flash sale" })).not.toBeInTheDocument();
  });

  it("hides a sale that has already ended once mounted", async () => {
    const sale = { ...createFlashSale(NOW), endsAt: new Date(NOW.getTime() - 1000).toISOString() };
    vi.mocked(getCurrentFlashSale).mockResolvedValue(sale);
    await renderSection();
    expect(screen.queryByRole("heading", { name: "Flash sale" })).not.toBeInTheDocument();
  });
});

describe("stockLine", () => {
  it("says Đã bán at 79 and Sắp hết at 80", () => {
    expect(stockLine(79)).toBe("Đã bán 79%");
    expect(stockLine(80)).toBe("Sắp hết");
  });
});
