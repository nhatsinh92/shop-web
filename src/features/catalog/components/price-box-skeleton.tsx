import { Skeleton } from "@/components/ui/skeleton";

/** Fallback while the price box waits for availability. */
export function PriceBoxSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Đang tải giá"
      className="flex flex-col gap-3 rounded-2xl bg-brand-tint p-5"
    >
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}
