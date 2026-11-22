// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { mergeCookieHeader, refreshSession } from "./refresh-session.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function refreshedResponse(): Response {
  const headers = new Headers();
  headers.append("set-cookie", "access_token=new-a; Path=/; HttpOnly");
  headers.append("set-cookie", "refresh_token=new-r; Path=/; HttpOnly");
  headers.append("set-cookie", "logged_in=1; Path=/");
  return new Response(null, { status: 204, headers });
}

describe("refreshSession", () => {
  it("posts only the refresh_token cookie to CORE_INTERNAL_URL and returns the rotated tokens", async () => {
    vi.stubEnv("CORE_INTERNAL_URL", "http://core.test");
    const fetchMock = vi.fn().mockResolvedValue(refreshedResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await refreshSession("old-r");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://core.test/api/auth/refresh");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ cookie: "refresh_token=old-r" });
    expect(result).toEqual({
      status: "refreshed",
      setCookies: [
        "access_token=new-a; Path=/; HttpOnly",
        "refresh_token=new-r; Path=/; HttpOnly",
        "logged_in=1; Path=/",
      ],
      tokens: { access_token: "new-a", refresh_token: "new-r" },
    });
  });

  it("falls back to the local core URL", async () => {
    vi.stubEnv("CORE_INTERNAL_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(refreshedResponse());
    vi.stubGlobal("fetch", fetchMock);
    await refreshSession("r");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:8081/api/auth/refresh");
  });

  it("maps 401 to unauthorized and 5xx or network errors to unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    expect(await refreshSession("r")).toEqual({ status: "unauthorized" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    expect(await refreshSession("r")).toEqual({ status: "unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    expect(await refreshSession("r")).toEqual({ status: "unavailable" });
  });

  it("gives up after the time budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    expect(await refreshSession("r", 20)).toEqual({ status: "unavailable" });
  });
});

describe("mergeCookieHeader", () => {
  it("replaces rotated tokens and keeps other cookies", () => {
    expect(
      mergeCookieHeader("guest_cart=g1; access_token=old; refresh_token=oldr; x=1", {
        access_token: "a2",
        refresh_token: "r2",
      }),
    ).toBe("guest_cart=g1; access_token=a2; refresh_token=r2; x=1");
  });

  it("appends tokens missing from the header, including an empty header", () => {
    expect(mergeCookieHeader("guest_cart=g1", { access_token: "a" })).toBe(
      "guest_cart=g1; access_token=a",
    );
    expect(mergeCookieHeader(null, { access_token: "a" })).toBe("access_token=a");
  });
});
