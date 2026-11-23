import {
  getProductBySlug,
  listStaticProductSlugs,
  ProductBreadcrumb,
  ProductDescription,
  ProductGallery,
  ProductHeading,
  ProductServiceInfo,
  SimilarProducts,
} from "@/features/catalog";

// Product page: STATIC (generateStaticParams / ISR) for breadcrumb, gallery, heading and
// description; CACHE (hours) for similar products. Reads no cookies, headers or searchParams.
// Slugs not returned below render on first request; an unknown slug calls notFound().
export async function generateStaticParams() {
  return (await listStaticProductSlugs()).map((slug) => ({ slug }));
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  const colorName =
    product.variants[0]?.options.find((option) => option.name === "color")?.value ?? product.name;

  return (
    <main className="mx-auto flex max-w-content flex-col gap-10 px-6 pt-5 pb-16">
      <ProductBreadcrumb categoryPath={product.category.path} productName={product.name} />
      <section className="grid items-start gap-12 lg:grid-cols-2">
        <ProductGallery images={product.images} colorName={colorName} />
        <div className="flex min-w-0 flex-col gap-6">
          <ProductHeading brand={product.brand} name={product.name} />
          {/* Slot for the price box, variants and quantity (next task, #58). */}
          <div data-slot="price-box" />
          <ProductServiceInfo />
        </div>
      </section>
      <ProductDescription description={product.description} />
      <SimilarProducts product={product} />
    </main>
  );
}
