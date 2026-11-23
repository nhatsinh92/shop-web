import { formatVnd } from "@/lib/format";

import { getAvailability, getCurrentFlashSale } from "../catalog.server";
import type { Availability, ProductDetail } from "../catalog.server";
import { StockSync } from "./purchase-panel";

interface PriceBoxProps {
  product: ProductDetail;
  sku: string;
}

export function discountPercent(shown: number, struck: number): number | null {
  if (struck <= shown) return null;
  return Math.round(100 * (1 - shown / struck));
}

export function stockText(availability: Availability): string {
  if (availability.stockLevel === "OUT_OF_STOCK") return "Hết hàng";
  if (availability.stockLevel === "LOW") {
    return `Sắp hết · còn khoảng ${availability.approxQuantity ?? 0} sản phẩm`;
  }
  return "Còn hàng";
}

/**
 * Price, struck price, discount, flash sale label and stock of one SKU
 * (CACHE · seconds · tag product-{id}). Render inside its own `<Suspense>`.
 */
export async function PriceBox({ product, sku }: PriceBoxProps) {
  const [availability, sale] = await Promise.all([
    getAvailability(sku, product.id),
    // The sale only decorates the box; losing it must not lose the price.
    getCurrentFlashSale().catch(() => null),
  ]);
  const saleItem = sale?.items.find((item) => item.slug === product.slug);
  const shown = availability.price.amount;
  const struck = product.listPrice?.amount ?? product.price.amount;
  const discount = discountPercent(shown, struck);
  const outOfStock = availability.stockLevel === "OUT_OF_STOCK";

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-brand-tint p-5">
      <StockSync outOfStock={outOfStock} />
      {saleItem && (
        <span className="text-[13px] font-bold tracking-[0.06em] text-brand-deep uppercase">
          Flash sale 12.12
        </span>
      )}
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-extrabold tracking-[-0.02em] text-brand">
          {formatVnd(shown)}
        </span>
        {discount !== null && (
          <>
            <s className="text-lg text-muted-foreground">{formatVnd(struck)}</s>
            <span className="rounded-md bg-brand px-2 py-1 text-[13px] font-bold text-white">
              -{discount}%
            </span>
          </>
        )}
      </div>
      {saleItem && (
        <div
          role="progressbar"
          aria-label="Đã bán"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={saleItem.soldPercent}
          className="h-2 overflow-hidden rounded bg-brand-track"
        >
          <div className="h-full bg-brand" style={{ width: `${saleItem.soldPercent}%` }} />
        </div>
      )}
      <span className={outOfStock ? "text-sm font-semibold text-brand-deep" : "text-sm"}>
        {stockText(availability)}
      </span>
    </div>
  );
}
