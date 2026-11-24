import Link from "next/link";
import type { ReactNode } from "react";

/**
 * STATIC shell of the cart page (artboard Cart, tag `STATIC shell`): slim header, back link, two
 * columns (stacked at phone width) and the summary card frame. The streamed cart goes in
 * `cartViewSlot`; the summary amounts (#88) go in `summarySlot`.
 */
export function CartPageShell({
  cartViewSlot,
  summarySlot,
}: {
  cartViewSlot: ReactNode;
  summarySlot?: ReactNode;
}) {
  return (
    <>
      <div className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-x-6 px-6 py-4">
          <p className="text-lg font-bold text-ink">Giỏ hàng</p>
          <Link
            href="/"
            className="flex h-touch items-center rounded-lg text-sm font-semibold text-brand-deep"
          >
            ← Tiếp tục mua sắm
          </Link>
        </div>
      </div>
      <main className="mx-auto flex max-w-content flex-col gap-5 px-6 pt-7 pb-16">
        <div className="flex flex-col items-stretch gap-6 lg:flex-row lg:items-start">
          <section aria-label="Sản phẩm trong giỏ" className="min-w-0 flex-1">
            {cartViewSlot}
          </section>
          <aside aria-label="Tóm tắt đơn hàng" className="flex flex-col gap-4 lg:w-[340px]">
            <div className="flex flex-col gap-3.5 rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="text-lg font-extrabold text-ink">Tóm tắt</h2>
              {summarySlot}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
