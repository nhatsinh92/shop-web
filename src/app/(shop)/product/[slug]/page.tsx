import { Suspense } from "react";

import {
  getProductBySlug,
  listStaticProductSlugs,
  MemberPrice,
  MemberPriceSkeleton,
  PriceBox,
  PriceBoxSkeleton,
  ProductBreadcrumb,
  ProductDescription,
  ProductHeading,
  ProductSelectionProvider,
  ProductServiceInfo,
  PurchasePanel,
  SelectedGallery,
  SimilarProducts,
} from "@/features/catalog";

// Product page: STATIC (generateStaticParams / ISR) for breadcrumb, gallery, heading and
// description; CACHE (hours) for similar products; STREAM for the member price (reads cookies
// inside its own Suspense). Reads no cookies, headers or searchParams.
// Slugs not returned below render on first request; an unknown slug calls notFound().
export async function generateStaticParams() {
  return (await listStaticProductSlugs()).map((slug) => ({ slug }));
}

export default async function ProductPage({ params }: PageProps<"/product/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  const colors = product.variants.map((variant) => ({
    sku: variant.sku,
    color: variant.options.find((option) => option.name === "color")?.value,
  }));
  const colorBySku = Object.fromEntries(
    colors.flatMap(({ sku, color }) => (color ? [[sku, color]] : [])),
  );
  // The picker needs a colour on every variant; a single plain product shows none.
  const pickerVariants = colors.every(({ color }) => color)
    ? colors.map(({ sku, color }) => ({ sku, color: color ?? "" }))
    : [];
  const skus = product.variants.length > 0 ? product.variants.map((v) => v.sku) : [product.sku];
  const priceBoxes = Object.fromEntries(
    skus.map((sku) => [
      sku,
      // Availability is CACHE · seconds, so it streams: not part of the prerendered shell.
      <Suspense key={sku} fallback={<PriceBoxSkeleton />}>
        <PriceBox product={product} sku={sku} />
      </Suspense>,
    ]),
  );

  return (
    <main className="mx-auto flex max-w-content flex-col gap-10 px-6 pt-5 pb-16">
      <ProductBreadcrumb categoryPath={product.category.path} productName={product.name} />
      <ProductSelectionProvider initialSku={skus[0] ?? product.sku}>
        <section className="grid items-start gap-12 lg:grid-cols-2">
          <SelectedGallery
            images={product.images}
            colorBySku={colorBySku}
            fallbackName={product.name}
          />
          <div className="flex min-w-0 flex-col gap-6">
            <ProductHeading brand={product.brand} name={product.name} />
            <Suspense fallback={<MemberPriceSkeleton />}>
              <MemberPrice slug={slug} />
            </Suspense>
            <PurchasePanel variants={pickerVariants} priceBoxes={priceBoxes} />
            <ProductServiceInfo />
          </div>
        </section>
      </ProductSelectionProvider>
      <ProductDescription description={product.description} />
      <SimilarProducts product={product} />
    </main>
  );
}
