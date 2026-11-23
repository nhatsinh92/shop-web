import Link from "next/link";

import { getCurrentFlashSale } from "../catalog.server";
import { FlashSaleCountdown } from "./flash-sale-countdown";
import { ProductCard } from "./product-card";

/** Stock share (percent sold) from which the card says "Sắp hết". */
export const ALMOST_SOLD_OUT_PERCENT = 80;

export function stockLine(soldPercent: number): string {
  return soldPercent >= ALMOST_SOLD_OUT_PERCENT ? "Sắp hết" : `Đã bán ${soldPercent}%`;
}

/** Cached flash sale (CACHE · minutes · tag flash-sale). Renders nothing when no sale runs. */
export async function FlashSaleSection() {
  const sale = await getCurrentFlashSale();
  if (!sale || sale.items.length === 0) return null;

  return (
    <FlashSaleCountdown
      endsAt={sale.endsAt}
      // "Xem tất cả" has no target page yet (owner decision 3); it links to the home page.
      action={
        <Link
          href="/"
          className="inline-flex min-h-touch items-center text-[15px] font-semibold text-brand-deep focus-visible:outline-2 focus-visible:outline-ring"
        >
          Xem tất cả
        </Link>
      }
    >
      <ul className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {sale.items.map((item) => (
          <li key={item.sku} className="flex">
            <div className="flex-1">
              <ProductCard
                product={item}
                salePrice={item.salePrice}
                stockLine={stockLine(item.soldPercent)}
              />
            </div>
          </li>
        ))}
      </ul>
    </FlashSaleCountdown>
  );
}
