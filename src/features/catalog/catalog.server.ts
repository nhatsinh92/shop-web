import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/api-error";
import type { components } from "@/lib/api/generated/core";
import { serverApi } from "@/lib/api/server";

export type ProductSummary = components["schemas"]["ProductSummary"];
export type ProductDetail = components["schemas"]["ProductDetail"];
export type Availability = components["schemas"]["Availability"];
export type FlashSale = components["schemas"]["FlashSale"];
export type FlashSaleItem = components["schemas"]["FlashSaleItem"];

// Time budgets (ms) for calls to core; docs/handoff/technical-notes.md § 7 allows 150–300 ms.
export const FLASH_SALE_BUDGET_MS = 250;
export const PRODUCT_BUDGET_MS = 300;
export const AVAILABILITY_BUDGET_MS = 200;
export const PRODUCT_LIST_BUDGET_MS = 300;

const SIMILAR_FETCH_LIMIT = 6;
const SIMILAR_SHOWN = 5;
/** Enough of the parent category to fill five after dropping the leaf and the product itself. */
const PARENT_FETCH_LIMIT = 12;

function isApiError(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}

/**
 * The running flash sale, or `null` when there is none (404 `FLASH_SALE_NONE`, cached like a
 * value). Every other failure is thrown so it is never cached as empty data.
 */
export async function getCurrentFlashSale(): Promise<FlashSale | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("flash-sale");

  try {
    const { data } = await serverApi("core", { budgetMs: FLASH_SALE_BUDGET_MS }).GET(
      "/api/flash-sales/current",
    );
    return data ?? null;
  } catch (error) {
    if (isApiError(error, "FLASH_SALE_NONE")) return null;
    throw error;
  }
}

/** A product by slug; `PRODUCT_NOT_FOUND` renders the 404 page. */
export async function getProductBySlug(slug: string): Promise<ProductDetail> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  let product: ProductDetail | undefined;
  try {
    ({ data: product } = await serverApi("core", { budgetMs: PRODUCT_BUDGET_MS }).GET(
      "/api/products/{slug}",
      { params: { path: { slug } } },
    ));
  } catch (error) {
    if (isApiError(error, "PRODUCT_NOT_FOUND")) notFound();
    throw error;
  }
  if (!product) throw new Error(`getProduct returned no body for ${slug}`);
  cacheTag(`product-${product.id}`);
  return product;
}

/** Price and stock of a SKU. Short-lived; tagged with the product id so a webhook can expire it. */
export async function getAvailability(sku: string, productId: string): Promise<Availability> {
  "use cache";
  cacheLife("seconds");
  cacheTag(`product-${productId}`);

  const { data } = await serverApi("core", { budgetMs: AVAILABILITY_BUDGET_MS }).GET(
    "/api/products/{sku}/availability",
    { params: { path: { sku } } },
  );
  if (!data) throw new Error(`getProductAvailability returned no body for ${sku}`);
  return data;
}

/** Up to five other products of the same leaf category. */
export async function getSimilarProducts(product: ProductDetail): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  // A leaf category can hold too few products (the ANC Pro is alone in its own), so the rest of
  // the parent category fills the list; listProducts includes subcategories. Leaf products come
  // first. Both lists are always read (the result is cached for hours, so the extra call is rare);
  // the parent is read first and the leaf last, which takes precedence when merging.
  const parent = product.category.path.at(-2)?.slug;
  const wider = parent ? await listCategory(parent, PARENT_FETCH_LIMIT) : [];
  const leaf = await listCategory(product.category.slug, SIMILAR_FETCH_LIMIT);

  const seen = new Set([product.slug]);
  const similar: ProductSummary[] = [];
  for (const item of [...leaf, ...wider]) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    similar.push(item);
  }
  return similar.slice(0, SIMILAR_SHOWN);
}

async function listCategory(category: string, limit: number): Promise<ProductSummary[]> {
  const { data } = await serverApi("core", { budgetMs: PRODUCT_LIST_BUDGET_MS }).GET(
    "/api/products",
    { params: { query: { category, limit } } },
  );
  if (!data) throw new Error(`listProducts returned no body for category ${category}`);
  return data.items;
}

/**
 * Slugs to prerender: the flash sale items plus the first page of the catalog. Throws when there
 * are none, so a build without data fails instead of producing an empty route.
 */
export async function listStaticProductSlugs(): Promise<string[]> {
  const [sale, page] = await Promise.all([getCurrentFlashSale(), listFirstPage()]);
  const slugs = [...new Set([...(sale?.items ?? []), ...page].map((p) => p.slug))];
  if (slugs.length === 0) throw new Error("listStaticProductSlugs found no products to prerender");
  return slugs;
}

async function listFirstPage(): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");

  const { data } = await serverApi("core", { budgetMs: PRODUCT_LIST_BUDGET_MS }).GET(
    "/api/products",
    {},
  );
  if (!data) throw new Error("listProducts returned no body");
  return data.items;
}
