import Image from "next/image";
import Link from "next/link";

import { formatVnd } from "@/lib/format";

interface Money {
  amount: number;
  currency: string;
}

export interface ProductCardProps {
  product: {
    slug: string;
    name: string;
    imageUrl: string;
    price: Money;
    listPrice?: Money;
  };
  /** Flash sale price; when set it is the shown price and the struck price is `listPrice ?? price`. */
  salePrice?: Money;
  /** Optional stock line, for example "Đã bán 40%" or "Sắp hết". */
  stockLine?: string;
}

/** Discount in percent, rounded; 0 when the old price is not higher than the shown one. */
function discountPercent(shown: number, old: number): number {
  return old > shown ? Math.round(100 * (1 - shown / old)) : 0;
}

/** Product card shared by the flash sale, similar products and recommendations. */
export function ProductCard({ product, salePrice, stockLine }: ProductCardProps) {
  const shown = salePrice ?? product.price;
  const old = salePrice ? (product.listPrice ?? product.price) : product.listPrice;
  const percent = old ? discountPercent(shown.amount, old.amount) : 0;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-white">
      <div className="relative aspect-square bg-stone-100">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 20vw, 50vw"
          className="object-cover"
        />
        {percent > 0 && (
          <span className="absolute top-2 left-2 rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white">
            -{percent}%
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 min-h-touch text-sm font-medium text-ink after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {product.name}
        </Link>
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-bold text-brand-deep">{formatVnd(shown.amount)}</span>
          {old && percent > 0 && <s className="text-xs text-stone-600">{formatVnd(old.amount)}</s>}
        </p>
        {stockLine && <p className="text-xs text-stone-700">{stockLine}</p>}
      </div>
    </article>
  );
}
