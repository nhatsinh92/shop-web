"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { messageFor } from "@/lib/api";

import { flushCartQuantity, removeCartItem, updateCartItem, type Cart } from "./api";
import { cartKeys, setCartCaches } from "./queries";

export const QUANTITY_DEBOUNCE_MS = 400;

export type CartSyncState = "saved" | "waiting" | "saving";

interface SkuEdit {
  timer: ReturnType<typeof setTimeout> | null;
  /** Bumped on every change; a response is applied only when it still matches. */
  seq: number;
  target: number;
  /** Last quantity the server confirmed (or the cached one before the first change). */
  confirmed: number;
  inFlight: number;
}

type EditMap = Map<string, SkuEdit>;

function recompute(cart: Cart, items: Cart["items"]): Cart {
  return {
    ...cart,
    items,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: {
      ...cart.subtotal,
      amount: items.reduce((sum, line) => sum + line.lineTotal.amount, 0),
    },
  };
}

function withQuantity(cart: Cart, sku: string, quantity: number): Cart {
  return recompute(
    cart,
    cart.items.map((line) =>
      line.sku === sku
        ? {
            ...line,
            quantity,
            lineTotal: { ...line.lineTotal, amount: line.unitPrice.amount * quantity },
          }
        : line,
    ),
  );
}

function writeCart(client: QueryClient, update: (cart: Cart) => Cart): void {
  const cart = client.getQueryData<Cart>(cartKeys.mine());
  if (cart) setCartCaches(client, update(cart));
}

/** True when another SKU still has a pending or in-flight change. */
function othersBusy(edits: EditMap, except: string): boolean {
  return [...edits].some(([key, e]) => key !== except && (e.timer !== null || e.inFlight > 0));
}

function syncOf(edits: EditMap): CartSyncState {
  let waiting = false;
  for (const edit of edits.values()) {
    if (edit.inFlight > 0) return "saving";
    if (edit.timer) waiting = true;
  }
  return waiting ? "waiting" : "saved";
}

/**
 * Optimistic quantity and remove edits for the cart page. Every change updates the full cart and
 * the badge at once; quantity changes are sent as one PATCH per SKU per 400 ms burst, a removal as
 * one DELETE. Pending quantities live in refs (no store); `sync` feeds the "Đã lưu" label.
 */
export function useCartEdits() {
  const client = useQueryClient();
  const editsRef = useRef<EditMap>(new Map());
  const [sync, setSync] = useState<CartSyncState>("saved");

  const refresh = useCallback(() => setSync(syncOf(editsRef.current)), []);

  const flush = useCallback(
    (sku: string) => {
      const edits = editsRef.current;
      const edit = edits.get(sku);
      if (!edit) return;
      edit.timer = null;
      const { seq, target } = edit;
      edit.inFlight += 1;
      refresh();
      updateCartItem(sku, target)
        .then((cart) => {
          const line = cart.items.find((l) => l.sku === sku);
          edit.confirmed = line?.quantity ?? target;
          if (edit.seq !== seq) return; // a newer change for this SKU is pending
          if (othersBusy(edits, sku) && line) {
            writeCart(client, (c) => withQuantity(c, sku, line.quantity));
          } else {
            setCartCaches(client, cart);
          }
        })
        .catch((error: unknown) => {
          if (edit.seq !== seq) return;
          writeCart(client, (c) => withQuantity(c, sku, edit.confirmed));
          toast.error(messageFor(error));
        })
        .finally(() => {
          edit.inFlight -= 1;
          if (edit.inFlight === 0 && !edit.timer) edits.delete(sku);
          refresh();
        });
    },
    [client, refresh],
  );

  const setQuantity = useCallback(
    (sku: string, quantity: number) => {
      const cart = client.getQueryData<Cart>(cartKeys.mine());
      const current = cart?.items.find((line) => line.sku === sku);
      if (!cart || !current) return;
      void client.cancelQueries({ queryKey: cartKeys.all });
      const edits = editsRef.current;
      let edit = edits.get(sku);
      if (!edit) {
        edit = { timer: null, seq: 0, target: quantity, confirmed: current.quantity, inFlight: 0 };
        edits.set(sku, edit);
      }
      if (edit.timer) clearTimeout(edit.timer);
      edit.seq += 1;
      edit.target = quantity;
      edit.timer = setTimeout(() => flush(sku), QUANTITY_DEBOUNCE_MS);
      setCartCaches(client, withQuantity(cart, sku, quantity));
      refresh();
    },
    [client, flush, refresh],
  );

  const remove = useCallback(
    (sku: string) => {
      const cart = client.getQueryData<Cart>(cartKeys.mine());
      const index = cart?.items.findIndex((line) => line.sku === sku) ?? -1;
      const removed = cart?.items[index];
      if (!cart || !removed) return;
      void client.cancelQueries({ queryKey: cartKeys.all });
      const edits = editsRef.current;
      const pending = edits.get(sku);
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.timer = null;
        pending.seq += 1; // a late PATCH response must not bring the line back
      }
      setCartCaches(
        client,
        recompute(
          cart,
          cart.items.filter((line) => line.sku !== sku),
        ),
      );
      const key = `remove:${sku}`;
      edits.set(key, { timer: null, seq: 0, target: 0, confirmed: 0, inFlight: 1 });
      refresh();
      removeCartItem(sku)
        .then((next) => {
          if (!othersBusy(edits, key)) setCartCaches(client, next);
        })
        .catch((error: unknown) => {
          writeCart(client, (c) => {
            const items = c.items.filter((line) => line.sku !== sku);
            items.splice(Math.min(index, items.length), 0, removed);
            return recompute(c, items);
          });
          toast.error(messageFor(error));
        })
        .finally(() => {
          edits.delete(key);
          refresh();
        });
    },
    [client, refresh],
  );

  useEffect(() => {
    const edits = editsRef.current;
    const onPageHide = () => {
      for (const [sku, edit] of edits) {
        if (edit.timer) flushCartQuantity(sku, edit.target);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      for (const edit of edits.values()) if (edit.timer) clearTimeout(edit.timer);
    };
  }, []);

  return { setQuantity, remove, sync };
}
