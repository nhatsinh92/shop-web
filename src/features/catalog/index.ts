// Public API of the catalog feature. app/ imports from here only; other features never import it.
export { ProductCard } from "./components/product-card";
export { FlashSaleSection } from "./components/flash-sale-section";
export { RecommendationsSection } from "./components/recommendations-section";
export { RecommendationsSkeleton } from "./components/recommendations-skeleton";
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
export { ProductBreadcrumb } from "./components/product-breadcrumb";
export { ProductGallery } from "./components/product-gallery";
export { ProductHeading } from "./components/product-heading";
export { ProductDescription } from "./components/product-description";
export { ProductServiceInfo } from "./components/product-service-info";
export { SimilarProducts } from "./components/similar-products";
export { PriceBox } from "./components/price-box";
export { PriceBoxSkeleton } from "./components/price-box-skeleton";
export {
  ProductSelectionProvider,
  PurchasePanel,
  SelectedGallery,
  useProductSelection,
} from "./components/purchase-panel";
