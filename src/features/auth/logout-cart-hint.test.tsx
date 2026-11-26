import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { vi } from "vitest";

import { authOverrides } from "@mocks/auth-handlers";
import { server } from "@mocks/node";

import { readCartCount, useCartCountHint, writeCartCount } from "@/lib/hints/cart-count";
import * as persister from "@/lib/query/persister";

import { clearUserData, useLogout } from "./logout";

vi.mock("./session-hint", () => ({ notifySessionHintChanged: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useLogout(), { wrapper }) };
}

beforeEach(() => {
  writeCartCount(5);
});

afterEach(() => {
  document.cookie = "cart_count=; Max-Age=0; Path=/";
  vi.restoreAllMocks();
});

describe("logout clears the cart_count hint", () => {
  it("returns null from readCartCount after clearUserData", async () => {
    expect(readCartCount()).toBe(5);
    await clearUserData(new QueryClient());
    expect(readCartCount()).toBeNull();
  });

  it("clears the hint when the logout call succeeds", async () => {
    const { result } = setup();
    await act(() => result.current.mutateAsync());
    expect(readCartCount()).toBeNull();
  });

  it("clears the hint when the logout call answers 503", async () => {
    server.use(authOverrides.logoutUnavailable);
    const { result } = setup();
    await act(() => result.current.mutateAsync());
    expect(readCartCount()).toBeNull();
  });

  it("clears the hint when the logout call fails with a network error", async () => {
    server.use(http.post("*/api/auth/logout", () => HttpResponse.error()));
    const { result } = setup();
    await act(() => result.current.mutateAsync());
    expect(readCartCount()).toBeNull();
  });

  it("re-renders useCartCountHint subscribers with null", async () => {
    function Consumer() {
      const count = useCartCountHint();
      return <span data-testid="count">{count === null ? "none" : count}</span>;
    }
    render(<Consumer />);
    expect(screen.getByTestId("count").textContent).toBe("5");
    await act(() => clearUserData(new QueryClient()));
    expect(screen.getByTestId("count").textContent).toBe("none");
  });

  it("keeps the order: query cache, hint cookies, then the persisted cache", async () => {
    const client = new QueryClient();
    const seen: string[] = [];
    vi.spyOn(client, "clear").mockImplementation(() => {
      seen.push(`cache:${readCartCount()}`);
    });
    vi.spyOn(persister, "clearPersistedCache").mockImplementation(async () => {
      seen.push(`persisted:${readCartCount()}`);
    });
    await clearUserData(client);
    expect(seen).toEqual(["cache:5", "persisted:null"]);
  });
});
