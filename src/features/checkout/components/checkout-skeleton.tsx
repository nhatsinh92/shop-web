import { Skeleton } from "@/components/ui/skeleton";

/** Page skeleton: form column and summary card. `message` is the status line. */
export function CheckoutSkeleton({
  message = "Đang tải thông tin thanh toán…",
}: {
  message?: string;
}) {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="text-sm font-semibold text-ink">
        {message}
      </p>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {[0, 1, 2].map((section) => (
            <Skeleton key={section} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl lg:w-[360px]" />
      </div>
    </div>
  );
}

/** Skeleton for one read (shipping options, payment methods) that the client is still fetching. */
export function CheckoutSectionSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}
