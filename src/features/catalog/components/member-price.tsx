import Link from "next/link";

import { getMemberPriceForRequest } from "../member-price.server";
import { MemberPriceClient } from "./member-price-client";
import { MemberPriceLine } from "./member-price-line";

/**
 * Member price (STREAM · đọc cookie trong Suspense). Render inside its own `<Suspense>` with
 * `MemberPriceSkeleton`; never inside `'use cache'`.
 */
export async function MemberPrice({ slug }: { slug: string }) {
  const result = await getMemberPriceForRequest(slug);
  switch (result.kind) {
    case "price":
      return <MemberPriceLine price={result.price} />;
    case "client":
      return <MemberPriceClient slug={slug} />;
    case "guest":
      return (
        <Link
          href={`/login?next=${encodeURIComponent(`/product/${slug}`)}`}
          className="inline-flex min-h-touch items-center text-base font-semibold text-brand underline-offset-4 hover:underline"
        >
          Đăng nhập để xem giá thành viên
        </Link>
      );
    case "none":
      return null;
  }
}
