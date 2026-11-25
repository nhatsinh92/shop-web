import { CheckoutSection, CheckoutView } from "@/features/checkout";

import { CheckoutStart } from "./checkout-start";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CheckoutSearchParams = Promise<{ reservation?: string | string[] }>;

/** DYNAMIC hole: the only place that reads `searchParams`, so it must sit inside a `<Suspense>`. */
export async function CheckoutContent({ searchParams }: { searchParams: CheckoutSearchParams }) {
  const { reservation } = await searchParams;
  const id = Array.isArray(reservation) ? reservation[0] : reservation;
  if (!id || !UUID.test(id)) return <CheckoutStart />;
  return (
    <CheckoutSection reservationId={id}>
      <CheckoutView reservationId={id} />
    </CheckoutSection>
  );
}
