// Public API of the catalog feature. app/ imports from here only; other features never import it.
export { ProductCard } from "./components/product-card";
export { FlashSaleSection } from "./components/flash-sale-section";
export type { ProductCardProps } from "./components/product-card";
export {
  getAvailability,
  getCurrentFlashSale,
  getProductBySlug,
  getSimilarProducts,
  listStaticProductSlugs,
} from "./catalog.server";
export type {
  Availability,
  FlashSale,
  FlashSaleItem,
  ProductDetail,
  ProductSummary,
} from "./catalog.server";
