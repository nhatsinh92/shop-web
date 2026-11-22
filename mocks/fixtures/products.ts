import type { components } from "../../src/lib/api/generated/core";

type Schemas = components["schemas"];
type ProductDetail = Schemas["ProductDetail"];
type ProductSummary = Schemas["ProductSummary"];
type Availability = Schemas["Availability"];
type FlashSale = Schemas["FlashSale"];
type MemberPrice = Schemas["MemberPrice"];
type Category = Schemas["Category"];
type Problem = Schemas["Problem"];

/**
 * Product fixtures for the six catalog operations. The numbers are the "Seed numbers" of
 * shop-api's Product epic (plans/epics/product.md), so the artboards, these fixtures and the demo
 * seed agree. Prices are VND.
 */

const vnd = (amount: number): Schemas["Money"] => ({ amount, currency: "VND" });

function ref(slug: string, name: string): Schemas["CategoryRef"] {
  return { slug, name };
}

const electronics = ref("dien-tu", "Điện tử");
const fashion = ref("thoi-trang", "Thời trang");
const home = ref("nha-cua", "Nhà cửa");

function leaf(parent: Schemas["CategoryRef"], slug: string, name: string): Category {
  return { slug, name, path: [parent, ref(slug, name)] };
}

/** Root categories (path of one) followed by the leaf categories the products belong to. */
export const categoryFixtures: Category[] = [
  { ...electronics, path: [electronics] },
  { ...fashion, path: [fashion] },
  { ...home, path: [home] },
  leaf(electronics, "am-thanh", "Âm thanh"),
  leaf(electronics, "phu-kien-may-tinh", "Phụ kiện máy tính"),
  leaf(fashion, "ao-khoac", "Áo khoác"),
  leaf(home, "do-gia-dung", "Đồ gia dụng"),
];

function category(slug: string): Category {
  const found = categoryFixtures.find((c) => c.slug === slug);
  if (!found) throw new Error(`Unknown fixture category ${slug}`);
  return found;
}

interface Seed {
  n: number;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  listPrice?: number;
  stock: number;
  /** Flash sale price, sale stock is always 100 so `sold` is also the sold percent. */
  sale?: { price: number; sold: number };
  variants?: { sku: string; color: string }[];
}

/** Newest first, the order `listProducts` returns. */
const seeds: Seed[] = [
  {
    n: 1,
    sku: "SKU-ANC-BLK",
    slug: "tai-nghe-anc-pro",
    name: "Tai nghe không dây chống ồn ANC Pro",
    brand: "Sonic",
    category: "am-thanh",
    price: 1_290_000,
    listPrice: 1_790_000,
    stock: 40,
    sale: { price: 890_000, sold: 82 },
    variants: [
      { sku: "SKU-ANC-BLK", color: "Đen nhám" },
      { sku: "SKU-ANC-WHT", color: "Trắng sứ" },
      { sku: "SKU-ANC-BLU", color: "Xanh đêm" },
    ],
  },
  {
    n: 2,
    sku: "SKU-AIRFRY-6L",
    slug: "noi-chien-khong-dau-6l",
    name: "Nồi chiên không dầu 6L màn hình cảm ứng",
    brand: "Kitchen+",
    category: "do-gia-dung",
    price: 1_690_000,
    listPrice: 2_150_000,
    stock: 60,
    sale: { price: 1_290_000, sold: 64 },
  },
  {
    n: 3,
    sku: "SKU-JACKET-UNI",
    slug: "ao-khoac-gio-unisex",
    name: "Áo khoác gió unisex chống nước",
    brand: "Wind",
    category: "ao-khoac",
    price: 459_000,
    listPrice: 599_000,
    stock: 200,
    sale: { price: 359_000, sold: 47 },
  },
  {
    n: 4,
    sku: "SKU-KEYB-75",
    slug: "ban-phim-co-75-hot-swap",
    name: "Bàn phím cơ 75% hot-swap",
    brand: "Keyra",
    category: "phu-kien-may-tinh",
    price: 1_390_000,
    listPrice: 1_690_000,
    stock: 45,
    sale: { price: 1_150_000, sold: 91 },
  },
  {
    n: 5,
    sku: "SKU-FLASK-750",
    slug: "binh-giu-nhiet-inox-750ml",
    name: "Bình giữ nhiệt inox 750ml",
    brand: "Thermo",
    category: "do-gia-dung",
    price: 249_000,
    listPrice: 320_000,
    stock: 300,
    sale: { price: 189_000, sold: 30 },
  },
  {
    n: 6,
    sku: "SKU-MOUSE-SIL",
    slug: "chuot-khong-day-im-lang",
    name: "Chuột không dây im lặng",
    brand: "Keyra",
    category: "phu-kien-may-tinh",
    price: 249_000,
    stock: 150,
  },
  {
    n: 7,
    sku: "SKU-STAND-ALU",
    slug: "gia-do-laptop-nhom",
    name: "Giá đỡ laptop nhôm",
    brand: "Deskly",
    category: "phu-kien-may-tinh",
    price: 319_000,
    stock: 120,
  },
  {
    n: 8,
    sku: "SKU-SLEEVE-14",
    slug: "tui-chong-soc-14-inch",
    name: "Túi chống sốc 14 inch",
    brand: "Deskly",
    category: "phu-kien-may-tinh",
    price: 199_000,
    stock: 180,
  },
  {
    n: 9,
    sku: "SKU-LAMP-LED",
    slug: "den-ban-led-chong-can",
    name: "Đèn bàn LED chống cận",
    brand: "Lumi",
    category: "do-gia-dung",
    price: 459_000,
    stock: 90,
  },
  {
    n: 10,
    sku: "SKU-PAD-90",
    slug: "lot-chuot-co-lon-90cm",
    name: "Lót chuột cỡ lớn 90cm",
    brand: "Deskly",
    category: "phu-kien-may-tinh",
    price: 129_000,
    stock: 250,
  },
];

function uuid(kind: number, n: number): string {
  return `00000000-0000-4000-8000-${String(kind).padStart(4, "0")}${String(n).padStart(8, "0")}`;
}

function imageUrl(slug: string, index: number): string {
  return `https://placehold.co/600x600?text=${slug}-${index}`;
}

function toDetail(seed: Seed): ProductDetail {
  const variantSkus = seed.variants ?? [{ sku: seed.sku, color: "" }];
  return {
    id: uuid(1, seed.n),
    sku: seed.sku,
    slug: seed.slug,
    name: seed.name,
    brand: seed.brand,
    description: `${seed.name}. Hàng chính hãng, bảo hành 12 tháng, đổi trả trong 30 ngày.`,
    imageUrl: imageUrl(seed.slug, 0),
    images: [0, 1, 2, 3].map((i) => ({
      url: imageUrl(seed.slug, i),
      alt: `${seed.name} ${i + 1}`,
    })),
    price: vnd(seed.price),
    ...(seed.listPrice ? { listPrice: vnd(seed.listPrice) } : {}),
    ...(seed.listPrice ? { badges: ["DISCOUNT"] } : {}),
    category: category(seed.category),
    variants: variantSkus.map((v) => ({
      sku: v.sku,
      options: v.color ? [{ name: "color", value: v.color }] : [],
      price: vnd(seed.price),
    })),
  };
}

/** The ten products of the design canvas, newest first. */
export const productDetailFixtures: ProductDetail[] = seeds.map(toDetail);

function toSummary(detail: ProductDetail): ProductSummary {
  return {
    sku: detail.sku,
    slug: detail.slug,
    name: detail.name,
    imageUrl: detail.imageUrl,
    price: detail.price,
    ...(detail.listPrice ? { listPrice: detail.listPrice } : {}),
    ...(detail.badges ? { badges: detail.badges } : {}),
  };
}

/** The list-card projection of each product, same order. */
export const productSummaryFixtures: ProductSummary[] = productDetailFixtures.map(toSummary);

function stockLevel(stock: number): Availability["stockLevel"] {
  if (stock <= 0) return "OUT_OF_STOCK";
  return stock <= 50 ? "LOW" : "IN_STOCK";
}

/** Availability for one SKU; the price is the sale price for flash sale SKUs. */
export function availabilityFor(sku: string, stock: number, price: number): Availability {
  const level = stockLevel(stock);
  return {
    sku,
    price: vnd(price),
    stockLevel: level,
    ...(level === "LOW" ? { approxQuantity: Math.max(1, Math.floor(stock / 10) * 10) } : {}),
  };
}

/** Availability per SKU (every variant SKU), as the demo seed serves it during the sale. */
export const availabilityFixtures: Record<string, Availability> = Object.fromEntries(
  seeds.flatMap((seed) =>
    (seed.variants ?? [{ sku: seed.sku }]).map((v) => [
      v.sku,
      availabilityFor(v.sku, seed.stock, seed.sale?.price ?? seed.price),
    ]),
  ),
);

/** Flash sale window relative to `now`: started one hour ago, ends in two hours (as the seed). */
export function createFlashSale(now: Date = new Date()): FlashSale {
  const hour = 60 * 60 * 1000;
  return {
    id: uuid(2, 1),
    startsAt: new Date(now.getTime() - hour).toISOString(),
    endsAt: new Date(now.getTime() + 2 * hour).toISOString(),
    items: seeds.flatMap((seed, i) => {
      const summary = productSummaryFixtures[i];
      if (!seed.sale || !summary) return [];
      return [{ ...summary, salePrice: vnd(seed.sale.price), soldPercent: seed.sale.sold }];
    }),
  };
}

/** The current flash sale, computed when the module loads. */
export const flashSaleFixture: FlashSale = createFlashSale();

/** The tier of the demo member (see `userProfileFixture`). */
export const memberTier: MemberPrice["memberTier"] = "GOLD";

/** GOLD takes 5 % off the current price, rounded down to 500 VND (ANC Pro: 845 500). */
export function goldPrice(basePrice: number): number {
  return Math.floor((basePrice * 0.95) / 500) * 500;
}

/** Member price (GOLD) of the product with this slug, or undefined for an unknown slug. */
export function memberPriceFor(slug: string): MemberPrice | undefined {
  const detail = productDetailFixtures.find((p) => p.slug === slug);
  if (!detail) return undefined;
  const base = availabilityFixtures[detail.sku]?.price.amount ?? detail.price.amount;
  return { sku: detail.sku, memberTier, price: vnd(goldPrice(base)) };
}

export const productNotFoundProblem: Problem = {
  type: "about:blank",
  title: "Product not found",
  status: 404,
  code: "PRODUCT_NOT_FOUND",
};

export const flashSaleNoneProblem: Problem = {
  type: "about:blank",
  title: "No flash sale",
  status: 404,
  code: "FLASH_SALE_NONE",
};

export const unauthenticatedProblem: Problem = {
  type: "about:blank",
  title: "Unauthenticated",
  status: 401,
  code: "AUTH_UNAUTHENTICATED",
};

export const paginationCursorInvalidProblem: Problem = {
  type: "about:blank",
  title: "Invalid cursor",
  status: 400,
  code: "PAGINATION_CURSOR_INVALID",
};
