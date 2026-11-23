"use client";

import { useQuery } from "@tanstack/react-query";

import { catalogQueries } from "../queries";
import { MemberPriceLine } from "./member-price-line";
import { MemberPriceSkeleton } from "./member-price-skeleton";

/**
 * Browser fallback for the member price: used when the server hole timed out or its token had
 * expired. The browser client refreshes the session on 401. Any final error renders nothing.
 */
export function MemberPriceClient({ slug }: { slug: string }) {
  const { data, isPending } = useQuery(catalogQueries.memberPrice(slug));
  if (isPending) return <MemberPriceSkeleton />;
  return data ? <MemberPriceLine price={data} /> : null;
}
