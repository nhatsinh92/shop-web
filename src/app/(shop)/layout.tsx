import { CartBadge } from "@/features/cart";
import { SiteHeader } from "@/features/site-header";

// Features never import each other; app/ composes them (here: the cart badge into the header).
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader cartSlot={<CartBadge />} />
      {children}
    </>
  );
}
