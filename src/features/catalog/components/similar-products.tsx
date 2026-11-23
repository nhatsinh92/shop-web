import { getSimilarProducts } from "../catalog.server";
import type { ProductDetail } from "../catalog.server";
import { ProductCard } from "./product-card";

/** "Sản phẩm tương tự" (CACHE · hours): other products of the same category. */
export async function SimilarProducts({ product }: { product: ProductDetail }) {
  const items = await getSimilarProducts(product);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="sim-h" className="flex flex-col gap-5">
      <h2 id="sim-h" className="text-2xl font-extrabold">
        Sản phẩm tương tự
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
