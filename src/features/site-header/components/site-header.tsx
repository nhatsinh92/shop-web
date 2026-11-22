import { Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";

import { categories, promoMessages } from "../site-header.data";

type SiteHeaderProps = {
  /** Client-rendered cart link (the cart feature's CartBadge), composed by app/. */
  cartSlot: ReactNode;
  /** Client-rendered account entry (the auth feature's AccountEntry), composed by app/. */
  accountSlot?: ReactNode;
};

/**
 * Site header from artboard Main: promo bar, logo, search, account and cart, category nav.
 * A Server Component with no data access, so it is part of the static shell. User-specific
 * parts (account, cart) are client components passed in as slots.
 */
export function SiteHeader({ cartSlot, accountSlot }: SiteHeaderProps) {
  return (
    <>
      <div className="bg-ink text-[13px] text-white">
        <div className="mx-auto flex max-w-content flex-wrap justify-between gap-2 px-6 py-2">
          <span>{promoMessages.shipping}</span>
          <span>{promoMessages.support}</span>
        </div>
      </div>

      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-6 px-6 py-4">
          <Link
            href="/"
            className="text-[28px] font-extrabold tracking-[-0.03em] text-ink no-underline"
          >
            Mây<span className="text-brand">.</span>
          </Link>

          <form role="search" action="/search" className="flex min-w-0 flex-[1_1_320px]">
            <label htmlFor="site-search" className="sr-only">
              Tìm kiếm sản phẩm
            </label>
            <Input
              id="site-search"
              name="q"
              type="search"
              placeholder="Tìm sản phẩm, thương hiệu…"
              className="h-touch min-w-0 flex-1 rounded-l-[10px] rounded-r-none border-r-0 border-stone-300 px-4 text-[15px]"
            />
            <button
              type="submit"
              aria-label="Tìm kiếm"
              className="flex h-touch w-[52px] items-center justify-center rounded-r-[10px] bg-ink text-white focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Search aria-hidden="true" className="size-5" />
            </button>
          </form>

          <nav aria-label="Tài khoản" className="flex items-center gap-2">
            {accountSlot}
            {cartSlot}
          </nav>
        </div>

        <nav
          aria-label="Danh mục"
          className="mx-auto flex max-w-content flex-wrap gap-1 px-6 pb-3 text-sm"
        >
          {categories.map((name) => (
            <Link
              key={name}
              href={`/c/${encodeURIComponent(name)}`}
              className="rounded-md px-3 py-2.5 text-stone-700 no-underline"
            >
              {name}
            </Link>
          ))}
        </nav>
      </header>
    </>
  );
}
