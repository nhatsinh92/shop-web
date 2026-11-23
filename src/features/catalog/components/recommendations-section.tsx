import { listRecommendations } from "../recommendations.server";
import { ProductCard } from "./product-card";

/**
 * Streamed recommendations (STREAM · Suspense · timeout → ẩn). Renders nothing when the backend
 * fails, exceeds its budget or has no items; the failure is logged once.
 */
export async function RecommendationsSection() {
  let items: Awaited<ReturnType<typeof listRecommendations>>;
  try {
    items = await listRecommendations();
  } catch (error) {
    console.error("recommendations unavailable, hiding the section", error);
    return null;
  }
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="rec-h" className="flex flex-col gap-5">
      <h2 id="rec-h" className="text-3xl font-extrabold tracking-[-0.02em]">
        Gợi ý cho bạn
      </h2>
      <ul className="grid grid-cols-2 gap-5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {items.map((item) => (
          <li key={item.slug} className="flex">
            <div className="flex-1">
              <ProductCard product={item} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
