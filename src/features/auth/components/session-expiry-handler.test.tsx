import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { vi } from "vitest";

import { server } from "@mocks/node";

import { SessionExpiryHandler } from "./session-expiry-handler";

const listeners = new Set<() => void>();
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<object>()),
  onSessionExpired: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
}));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function mount() {
  const client = new QueryClient();
  client.setQueryData(["me"], 1);
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <SessionExpiryHandler />
      </QueryClientProvider>
    </StrictMode>,
  );
  return { client, ...view };
}

describe("SessionExpiryHandler", () => {
  beforeEach(() => {
    listeners.clear();
    replace.mockClear();
  });

  it("renders nothing and keeps one listener under StrictMode, removed on unmount", () => {
    const { container, unmount } = mount();
    expect(container).toBeEmptyDOMElement();
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it("cleans up without calling the logout API and redirects to /login", async () => {
    let logoutCalls = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.url.includes("/api/auth/logout")) logoutCalls += 1;
    });
    const { client } = mount();
    [...listeners][0]?.();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(logoutCalls).toBe(0);
    server.events.removeAllListeners();
  });
});
