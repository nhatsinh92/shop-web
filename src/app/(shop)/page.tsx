import { FlashSaleSection } from "@/features/catalog";
import { CategoryTiles, HomeHero } from "@/features/home";

// Home: static shell (CDN) with a cached flash sale (minutes, tag flash-sale). Prerendered; it
// reads no cookies, headers or searchParams. Recommendations (STREAM) arrive in #56.
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-6 pt-6 pb-16">
      <HomeHero />
      <FlashSaleSection />
      <CategoryTiles />
    </main>
  );
}
