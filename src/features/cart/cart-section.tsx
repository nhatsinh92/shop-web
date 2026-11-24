import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { cartKeys } from "./queries";
import { getCartForRequest } from "./cart.server";

/**
 * STREAM hole of the cart page. Fetches the request's cart (reads cookies, so it must sit inside
 * a `<Suspense>`) and hydrates it into `cartKeys.mine()`. Hydrates nothing when the fetch returns
 * `null` (budget exceeded or backend failure), so the client falls back to its own query.
 */
export async function CartSection({ children }: { children?: ReactNode }) {
  const cart = await getCartForRequest();
  const queryClient = new QueryClient();
  if (cart) queryClient.setQueryData(cartKeys.mine(), cart);

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
