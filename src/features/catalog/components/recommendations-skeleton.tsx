import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_COUNT = 5;

/** Suspense fallback of the recommendations hole: five card placeholders (artboard `recState=loading`). */
export function RecommendationsSkeleton() {
  return (
    <section aria-label="Gợi ý cho bạn" aria-busy="true" className="flex flex-col gap-5">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div
            key={index}
            data-testid="recommendation-skeleton-card"
            className="flex flex-col gap-2.5 rounded-xl border border-border p-3"
          >
            <Skeleton className="aspect-square" />
            <Skeleton className="h-3.5" />
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-5 w-2/5" />
          </div>
        ))}
      </div>
    </section>
  );
}
