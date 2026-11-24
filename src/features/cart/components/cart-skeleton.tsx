import { Skeleton } from "@/components/ui/skeleton";

/** Fallback for the streamed cart: three line placeholders and the summary placeholder. */
export function CartSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only" role="status">
        Đang tải giỏ hàng
      </span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          data-testid="cart-skeleton-line"
          className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4"
        >
          <Skeleton className="size-24 flex-none rounded-xl" />
          <div className="flex flex-1 flex-col gap-2.5">
            <Skeleton className="h-4 w-[70%]" />
            <Skeleton className="h-3.5 w-[35%]" />
            <Skeleton className="h-5 w-1/4" />
          </div>
          <Skeleton className="hidden h-11 w-30 flex-none rounded-xl sm:block" />
        </div>
      ))}
      <Skeleton data-testid="cart-skeleton-summary" className="h-48 w-full rounded-2xl lg:hidden" />
    </div>
  );
}
