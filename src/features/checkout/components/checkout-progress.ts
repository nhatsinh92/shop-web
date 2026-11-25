import { useSyncExternalStore } from "react";

// Tiny client-side store: has the order been placed? The step bar (in the page header, outside the
// dynamic hole) reads it to mark "3 Hoàn tất" current; CheckoutView sets it. Nothing is persisted.

let done = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (done === next) return;
  done = next;
  for (const listener of listeners) listener();
}

export const markOrderDone = () => set(true);
export const resetOrderProgress = () => set(false);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once the order was placed; false on the server and on first render. */
export function useOrderDone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => done,
    () => false,
  );
}
