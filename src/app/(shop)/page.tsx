import { Suspense } from "react";

import {
  FlashSaleSection,
  RecommendationsSection,
  RecommendationsSkeleton,
} from "@/features/catalog";
import { CategoryTiles, HomeHero } from "@/features/home";

// Home: static shell (CDN) with a cached flash sale (minutes, tag flash-sale). Prerendered; it
// reads no cookies, headers or searchParams. Recommendations (STREAM) are a dynamic hole inside
// <Suspense>: they read the access cookie, have a 250 ms budget and disappear on failure.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-6 pt-6 pb-16">
      <HomeHero />
      <FlashSaleSection />
      <CategoryTiles />
      <Suspense fallback={<RecommendationsSkeleton />}>
        <RecommendationsSection />
      </Suspense>
    </main>
  );
}
