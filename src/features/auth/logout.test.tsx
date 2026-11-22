import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { act, renderHook, waitFor } from "@testing-library/react";
import { get, set } from "idb-keyval";
import { vi } from "vitest";

import { authOverrides } from "@mocks/auth-handlers";
import { server } from "@mocks/node";

import { PERSISTED_CACHE_KEY, persistOptions } from "@/lib/query/persister";

import { useLogout } from "./logout";
import { notifySessionHintChanged } from "./session-hint";

vi.mock("./session-hint", () => ({ notifySessionHintChanged: vi.fn() }));

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function setup() {
  const client = new QueryClient();
  client.setQueryData(["me"], { id: 1 });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useLogout(), { wrapper }) };
}

beforeEach(() => {
  replace.mockClear();
  vi.mocked(notifySessionHintChanged).mockClear();
  document.cookie = "logged_in=1; path=/";
});

async function expectCleanedUp(client: QueryClient) {
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(document.cookie).not.toContain("logged_in");
  expect(notifySessionHintChanged).toHaveBeenCalledTimes(1);
  expect(await get(PERSISTED_CACHE_KEY)).toBeUndefined();
  expect(replace).toHaveBeenCalledWith("/");
}

describe("useLogout", () => {
  it("cleans up after a successful logout", async () => {
    await set(PERSISTED_CACHE_KEY, "stale");
    const { client, result } = setup();
    await act(() => result.current.mutateAsync());
    await expectCleanedUp(client);
  });

  it("cleans up even when the logout call answers 503", async () => {
    server.use(authOverrides.logoutUnavailable);
    await set(PERSISTED_CACHE_KEY, "stale");
    const { client, result } = setup();
    await act(() => result.current.mutateAsync());
    await expectCleanedUp(client);
  });

  it("leaves no persisted queries after the persister throttle elapsed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient();
      const [unsubscribe] = persistQueryClient({ queryClient: client, ...persistOptions });
      client.setQueryData(["cart"], { n: 1 });
      const { result } = renderHook(() => useLogout(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      });
      await act(() => result.current.mutateAsync());
      await act(() => vi.advanceTimersByTimeAsync(5000));
      const raw = await get<string>(PERSISTED_CACHE_KEY);
      const queries = raw ? (JSON.parse(raw).clientState.queries as unknown[]) : [];
      expect(queries).toHaveLength(0);
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is pending while the request runs", async () => {
    const { result } = setup();
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
