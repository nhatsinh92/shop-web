import Image from "next/image";
import Link from "next/link";

import { formatVnd } from "@/lib/format";

import type { Cart } from "../api";

export type CartLine = Cart["items"][number];

function StockLabel({ line }: { line: CartLine }) {
  if (!line.available)
    return <span className="text-sm font-semibold text-destructive">Hết hàng</span>;
  if (line.stockLevel === "LOW") {
    return <span className="text-sm font-semibold text-brand-deep">Sắp hết</span>;
  }
  if (line.stockLevel === "IN_STOCK") {
    return <span className="text-sm font-semibold text-success">Còn hàng</span>;
  }
  return null;
}

/** One read-only cart line: image, name, variant, prices, stock label and line total. */
export function CartLineItem({ line }: { line: CartLine }) {
  const struck = line.listPrice && line.listPrice.amount > line.unitPrice.amount;

  return (
    <article className="flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4">
      <div className="flex min-w-0 flex-[1_1_340px] items-center gap-4">
        <Image
          src={line.imageUrl}
          alt=""
          width={96}
          height={96}
          className="size-24 flex-none rounded-lg bg-stone-100 object-cover"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link
            href={`/product/${line.slug}`}
            className="flex min-h-touch items-center text-[15px] leading-snug font-semibold text-ink focus-visible:outline-2 focus-visible:outline-ring"
          >
            {line.name}
          </Link>
          {line.variantLabel && (
            <span className="text-[13px] text-stone-600">{line.variantLabel}</span>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-extrabold text-brand-deep">
              {formatVnd(line.unitPrice.amount)}
            </span>
            {struck && line.listPrice && (
              <s className="text-[13px] text-stone-500">{formatVnd(line.listPrice.amount)}</s>
            )}
          </div>
          <StockLabel line={line} />
        </div>
      </div>
      <span className="ml-auto min-w-[110px] text-right font-bold tabular-nums">
        {formatVnd(line.lineTotal.amount)}
      </span>
    </article>
  );
}
