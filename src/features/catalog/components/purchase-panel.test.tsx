import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PriceBox, discountPercent } from "./price-box";
import { PriceBoxSkeleton } from "./price-box-skeleton";
import {
  ProductSelectionProvider,
  PurchasePanel,
  SelectedGallery,
  useProductSelection,
} from "./purchase-panel";
import { QuantityStepper } from "./quantity-stepper";
import {
  availabilityFixtures,
  createFlashSale,
  productDetailFixtures,
} from "../../../../mocks/fixtures/products";
import { getAvailability, getCurrentFlashSale } from "../catalog.server";
import type { Availability } from "../catalog.server";

vi.mock("../catalog.server", () => ({ getAvailability: vi.fn(), getCurrentFlashSale: vi.fn() }));

const anc = productDetailFixtures.find((p) => p.slug === "tai-nghe-khong-day-anc-pro")!;
const plain = productDetailFixtures.find((p) => !p.listPrice)!;
const [black, white] = anc.variants;
const colorBySku = Object.fromEntries(
  anc.variants.map((v) => [v.sku, v.options[0]!.value]),
) as Record<string, string>;

function mockData(availability: Partial<Availability> = {}, sale = true) {
  vi.mocked(getAvailability).mockImplementation(async (sku) => ({
    ...availabilityFixtures[sku]!,
    ...availability,
  }));
  vi.mocked(getCurrentFlashSale).mockResolvedValue(sale ? createFlashSale() : null);
}

async function renderBox(product = anc, sku = product.sku) {
  render(
    <ProductSelectionProvider initialSku={sku}>
      {await PriceBox({ product, sku })}
    </ProductSelectionProvider>,
  );
}

function SelectionProbe() {
  const { sku, quantity, disabled } = useProductSelection();
  return <output>{`${sku}|${quantity}|${disabled}`}</output>;
}

describe("PriceBox", () => {
  it("reads availability of the SKU and shows price, struck price and discount", async () => {
    mockData();
    await renderBox();
    expect(getAvailability).toHaveBeenCalledWith(anc.sku, anc.id);
    expect(screen.getByText("890.000₫")).toBeInTheDocument();
    expect(screen.getByText("1.790.000₫").tagName).toBe("S");
    expect(screen.getByText("-50%")).toBeInTheDocument();
  });

  it("shows neither struck price nor discount without one", async () => {
    mockData({ price: plain.price }, false);
    await renderBox(plain);
    expect(screen.getByText(/₫/)).toBeInTheDocument();
    expect(screen.queryByText(/^-\d+%$/)).not.toBeInTheDocument();
    expect(document.querySelector("s")).toBeNull();
  });

  it("computes the discount only when the struck price is higher", () => {
    expect(discountPercent(890_000, 1_790_000)).toBe(50);
    expect(discountPercent(100, 100)).toBeNull();
    expect(discountPercent(200, 100)).toBeNull();
  });

  it("shows the flash sale label and sold bar for a non-first variant of a sale product", async () => {
    mockData();
    await renderBox(anc, white!.sku);
    expect(screen.getByText("Flash sale 12.12")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    const sold = createFlashSale().items.find((i) => i.slug === anc.slug)!.soldPercent;
    expect(bar).toHaveAttribute("aria-valuenow", String(sold));
    expect(bar.firstElementChild).toHaveStyle({ width: `${sold}%` });
  });

  it("shows no flash sale label or bar for a product outside the sale", async () => {
    mockData({ price: plain.price });
    await renderBox(plain);
    expect(screen.queryByText("Flash sale 12.12")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("still shows the price when the flash sale cannot be read", async () => {
    mockData();
    vi.mocked(getCurrentFlashSale).mockRejectedValue(new Error("down"));
    await renderBox();
    expect(screen.getByText("890.000₫")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("stock line: LOW shows the approximate quantity", async () => {
    mockData({ stockLevel: "LOW", approxQuantity: 40 });
    await renderBox();
    expect(screen.getByText("Sắp hết · còn khoảng 40 sản phẩm")).toBeInTheDocument();
  });

  it("stock line: IN_STOCK shows Còn hàng and stays enabled", async () => {
    mockData({ stockLevel: "IN_STOCK" });
    render(
      <ProductSelectionProvider initialSku={anc.sku}>
        {await PriceBox({ product: anc, sku: anc.sku })}
        <SelectionProbe />
      </ProductSelectionProvider>,
    );
    expect(screen.getByText("Còn hàng")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`${anc.sku}|1|false`);
  });

  it("stock line: OUT_OF_STOCK shows Hết hàng and disables the selection", async () => {
    mockData({ stockLevel: "OUT_OF_STOCK" });
    render(
      <ProductSelectionProvider initialSku={anc.sku}>
        {await PriceBox({ product: anc, sku: anc.sku })}
        <SelectionProbe />
      </ProductSelectionProvider>,
    );
    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("|1|true"));
  });
});

describe("PriceBoxSkeleton", () => {
  it("is a busy placeholder", () => {
    render(<PriceBoxSkeleton />);
    expect(screen.getByLabelText("Đang tải giá")).toHaveAttribute("aria-busy", "true");
  });
});

describe("QuantityStepper", () => {
  it("disables − at the minimum and + at the maximum", () => {
    const { rerender } = render(
      <QuantityStepper value={1} onDecrement={vi.fn()} onIncrement={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tăng số lượng" })).toBeEnabled();
    rerender(<QuantityStepper value={10} onDecrement={vi.fn()} onIncrement={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tăng số lượng" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Giảm số lượng" })).toBeEnabled();
  });
});

describe("PurchasePanel", () => {
  const variants = anc.variants.map((v) => ({ sku: v.sku, color: colorBySku[v.sku]! }));
  const priceBoxes = Object.fromEntries(
    anc.variants.map((v) => [v.sku, <p key={v.sku}>box {v.sku}</p>]),
  );

  function renderPanel() {
    return render(
      <ProductSelectionProvider initialSku={black!.sku}>
        <SelectedGallery images={anc.images} colorBySku={colorBySku} fallbackName={anc.name} />
        <PurchasePanel
          variants={variants}
          priceBoxes={priceBoxes}
          addToCartSlot={<button type="button">Slot</button>}
        />
        <SelectionProbe />
      </ProductSelectionProvider>,
    );
  }

  it("picks a variant by keyboard, updating the price box SKU and the gallery alt text", async () => {
    renderPanel();
    expect(screen.getByRole("radiogroup", { name: /Màu sắc:/ })).toBeInTheDocument();
    expect(screen.getByText(`box ${black!.sku}`)).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: `Ảnh sản phẩm – ${colorBySku[black!.sku]}` }),
    ).toBeInTheDocument();

    act(() => screen.getByRole("radio", { checked: true }).focus());
    // Radix moves focus in a timeout and selects it only while the arrow key is still down.
    await userEvent.keyboard("{ArrowRight>}");
    expect(await screen.findByText(`box ${white!.sku}`)).toBeInTheDocument();
    await userEvent.keyboard("{/ArrowRight}");
    expect(screen.queryByText(`box ${black!.sku}`)).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: `Ảnh sản phẩm – ${colorBySku[white!.sku]}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(`${white!.sku}|1|false`);
  });

  it("steps the quantity within 1–10 and exposes it through useProductSelection", async () => {
    renderPanel();
    const plus = screen.getByRole("button", { name: "Tăng số lượng" });
    for (let i = 0; i < 12; i++)
      if (!(plus as HTMLButtonElement).disabled) await userEvent.click(plus);
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent(`${black!.sku}|10|false`);
    expect(plus).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Giảm số lượng" }));
    expect(screen.getByText("9")).toBeInTheDocument();
  });

  it("renders the addToCartSlot", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Slot" })).toBeInTheDocument();
  });

  it("throws a clear error without a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SelectionProbe />)).toThrow("ProductSelectionProvider is missing");
    spy.mockRestore();
  });
});
