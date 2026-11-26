import { readFileSync } from "node:fs";
import { delay, http, HttpResponse } from "msw";

import { flagsAllOff, flagsAllOn } from "../../../mocks/fixtures/flags";
import { flagsOverride } from "../../../mocks/flags-handlers";
import { server } from "../../../mocks/node";

const { cacheLife, cacheTag } = vi.hoisted(() => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));

import { DEFAULT_FLAGS, FLAGS_BUDGET_MS, getFlags } from "./flags.server";

const FLAGS_URL = "http://localhost:8081/api/flags";
const defaults = { recommendations: true, memberPrice: true, onlinePayment: true };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("getFlags caching and budget", () => {
  it("uses 'use cache' with a 5 s profile, the flags tag and a 100 ms budget on core", async () => {
    const source = readFileSync("src/lib/flags/flags.server.ts", "utf8");
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).toContain('"use cache";');
    expect(source).toContain('serverApi("core", { budgetMs: FLAGS_BUDGET_MS })');
    expect(FLAGS_BUDGET_MS).toBe(100);

    await getFlags();
    expect(cacheLife).toHaveBeenCalledWith({ stale: 5, revalidate: 5, expire: 60 });
    expect(cacheTag).toHaveBeenCalledWith("flags");
  });
});

describe("getFlags results", () => {
  it("resolves to flagsAllOn with the MSW default and logs nothing", async () => {
    await expect(getFlags()).resolves.toEqual(flagsAllOn);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("resolves to flagsAllOff with the all-off override", async () => {
    server.use(flagsOverride("all-off"));
    await expect(getFlags()).resolves.toEqual(flagsAllOff);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ignores unknown extra properties", async () => {
    server.use(
      http.get(FLAGS_URL, () => HttpResponse.json({ ...flagsAllOff, newFlag: true, extra: 1 })),
    );
    const flags = await getFlags();
    expect(Object.keys(flags).sort()).toEqual(["memberPrice", "onlinePayment", "recommendations"]);
    expect(flags).toEqual(flagsAllOff);
  });
});

describe("getFlags failures fall back to the defaults", () => {
  it("exposes the defaults as all on", () => {
    expect(DEFAULT_FLAGS).toEqual(defaults);
  });

  it("on a 503 resolves to the defaults and logs one error", async () => {
    server.use(flagsOverride("error"));
    await expect(getFlags()).resolves.toEqual(defaults);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("/api/flags");
  });

  it("on a network error resolves to the defaults and logs one error", async () => {
    server.use(http.get(FLAGS_URL, () => HttpResponse.error()));
    await expect(getFlags()).resolves.toEqual(defaults);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("/api/flags");
  });

  it("on a malformed body resolves to the defaults and logs one error", async () => {
    server.use(http.get(FLAGS_URL, () => HttpResponse.json({ recommendations: "yes" })));
    await expect(getFlags()).resolves.toEqual(defaults);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("/api/flags");
  });

  it("on a response slower than 100 ms resolves to the defaults and logs one error", async () => {
    server.use(
      http.get(FLAGS_URL, async () => {
        await delay(500);
        return HttpResponse.json(flagsAllOff);
      }),
    );
    await expect(getFlags()).resolves.toEqual(defaults);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("/api/flags");
  });
});
