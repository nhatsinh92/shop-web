"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/api";

import { addCartItem, type CartSummary } from "../api";
import { cartKeys } from "../queries";

interface AddToCartButtonProps {
  sku: string;
  quantity: number;
  disabled?: boolean;
}

interface AddContext {
  previous: CartSummary | undefined;
}

/**
 * "Thêm vào giỏ": optimistic (artboard PDP, tag CLIENT → gateway · optimistic). The header badge
 * and the toast update at once; the previous summary comes back if the request fails. No debounce.
 */
export function AddToCartButton({ sku, quantity, disabled = false }: AddToCartButtonProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, unknown, { sku: string; quantity: number }, AddContext>({
    mutationFn: addCartItem,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: cartKeys.all });
      const previous = queryClient.getQueryData<CartSummary>(cartKeys.summary());
      queryClient.setQueryData<CartSummary>(cartKeys.summary(), {
        itemCount: (previous?.itemCount ?? 0) + input.quantity,
      });
      toast.success(`Đã thêm ${input.quantity} sản phẩm vào giỏ`, {
        description: (
          <Link href="/cart" className="font-medium text-brand underline">
            Xem giỏ
          </Link>
        ),
      });
      return { previous };
    },
    onError: (error, _input, context) => {
      // Restore the exact count from before this click (or drop the guess if there was none).
      if (context?.previous) queryClient.setQueryData(cartKeys.summary(), context.previous);
      else queryClient.removeQueries({ queryKey: cartKeys.summary() });
      toast.error(messageFor(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: cartKeys.all }),
  });

  return (
    <Button
      type="button"
      size="lg"
      disabled={disabled}
      onClick={() => mutation.mutate({ sku, quantity })}
      className="h-touch w-full gap-2 bg-brand text-base font-semibold text-white hover:bg-brand/90"
    >
      <ShoppingCart aria-hidden="true" />
      Thêm vào giỏ
    </Button>
  );
}
