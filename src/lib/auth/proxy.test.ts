// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function jwt(secondsFromNow: number): string {
  return `${encode({ alg: "none" })}.${encode({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })}.sig`;
}

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://shop.test${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function refreshOk(): Response {
  const headers = new Headers();
  headers.append("set-cookie", "access_token=NEWA; Path=/; HttpOnly");
  headers.append("set-cookie", "refresh_token=NEWR; Path=/; HttpOnly");
  headers.append("set-cookie", "logged_in=1; Path=/");
  return new Response(null, { status: 204, headers });
}

/** NextResponse.next({request}) exposes overridden request headers this way. */
function forwardedCookie(res: Response): string | null {
  return res.headers.get("x-middleware-request-cookie");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("proxy config", () => {
  it("matches exactly /cart, /account/:path* and /checkout", () => {
    expect(config.matcher).toEqual(["/cart", "/account/:path*", "/checkout"]);
  });
});

describe("valid access token", () => {
  it("continues without a refresh request when valid for more than 60 seconds", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await proxy(request("/account", `access_token=${jwt(120)}; refresh_token=r`));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("refresh", () => {
  it.each([
    ["expiring", `access_token=${jwt(30)}; refresh_token=OLDR; guest_cart=g1`],
    ["missing", "refresh_token=OLDR; guest_cart=g1"],
  ])(
    "refreshes once when the access token is %s and forwards the new tokens",
    async (_n, cookie) => {
      const fetchMock = vi.fn().mockResolvedValue(refreshOk());
      vi.stubGlobal("fetch", fetchMock);

      const res = await proxy(request("/account/orders", cookie));

      expect(fetchMock).toHaveBeenCalledOnce();
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(init.headers).toMatchObject({ cookie: "refresh_token=OLDR" });
      expect(res.headers.getSetCookie()).toEqual([
        "access_token=NEWA; Path=/; HttpOnly",
        "refresh_token=NEWR; Path=/; HttpOnly",
        "logged_in=1; Path=/",
      ]);
      const forwarded = forwardedCookie(res) ?? "";
      expect(forwarded).toContain("access_token=NEWA");
      expect(forwarded).toContain("refresh_token=NEWR");
      expect(forwarded).toContain("guest_cart=g1");
      expect(forwarded).not.toContain("OLDR");
    },
  );

  it("continues with unchanged cookies when the refresh call never resolves (300 ms budget)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    );
    const started = Date.now();
    const res = await proxy(request("/checkout", "refresh_token=r"));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(forwardedCookie(res)).toBeNull();
  });

  it.each([
    ["network error", () => Promise.reject(new TypeError("down"))],
    ["5xx", () => Promise.resolve(new Response(null, { status: 502 }))],
  ])("continues unchanged on %s", async (_n, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    const res = await proxy(request("/account", "refresh_token=r"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(forwardedCookie(res)).toBeNull();
  });
});

describe("no usable session", () => {
  it.each(["/account", "/account/orders", "/checkout"])(
    "redirects %s to /login?next= when there are no tokens",
    async (path) => {
      const res = await proxy(request(`${path}?tab=1`));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        `https://shop.test/login?next=${encodeURIComponent(`${path}?tab=1`)}`,
      );
    },
  );

  it.each(["/account", "/account/orders", "/checkout"])(
    "redirects %s when the refresh answers 401",
    async (path) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
      const res = await proxy(request(path, "refresh_token=revoked"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        `https://shop.test/login?next=${encodeURIComponent(path)}`,
      );
    },
  );

  it("never redirects /cart, with no tokens or a 401 refresh", async () => {
    const guest = await proxy(request("/cart"));
    expect(guest.status).toBe(200);
    expect(guest.headers.get("x-middleware-next")).toBe("1");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const stale = await proxy(request("/cart", "refresh_token=revoked"));
    expect(stale.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps a still-valid expiring access token when there is no refresh token", async () => {
    const res = await proxy(request("/account", `access_token=${jwt(20)}`));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("secrets", () => {
  it("never logs token values or puts them in the redirect URL", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const secret = "SECRET-REFRESH-VALUE";
    const res = await proxy(request("/checkout", `refresh_token=${secret}`));
    expect(res.headers.get("location")).not.toContain(secret);
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(secret);
  });
});
