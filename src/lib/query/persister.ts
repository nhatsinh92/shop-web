import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";

/** IndexedDB key of the persisted query cache. Logout removes it (Phase 2). */
export const PERSISTED_CACHE_KEY = "may-query-cache";

/** Bump when persisted data shapes change, so old caches are discarded. */
export const PERSISTED_CACHE_BUSTER = "v1";

const idbStorage = {
  getItem: (key: string) => get<string>(key).then((value) => value ?? null),
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
};

const noopStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

export const queryPersister = createAsyncStoragePersister({
  storage: typeof indexedDB === "undefined" ? noopStorage : idbStorage,
  key: PERSISTED_CACHE_KEY,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: queryPersister,
  buster: PERSISTED_CACHE_BUSTER,
  maxAge: 24 * 60 * 60 * 1000,
  dehydrateOptions: {
    // Opt-in only: user data is persisted when a query sets meta.persist (cart, Phase 4).
    shouldDehydrateQuery: (query) =>
      query.meta?.persist === true && query.state.status === "success",
  },
};

/** Removes the persisted cache, for logout. */
export function clearPersistedCache() {
  return queryPersister.removeClient();
}
