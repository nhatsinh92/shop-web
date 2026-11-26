import { describe, expect, it } from "vitest";

import { flagsAllOff, flagsAllOn } from "./fixtures/flags";
import { flagsOverride } from "./flags-handlers";
import { server } from "./node";

const getFlags = () => fetch("http://localhost/api/flags");

describe("flags handlers", () => {
  it("answers GET /api/flags with flagsAllOn and a 5 second shared cache by default", async () => {
    const res = await getFlags();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=5");
    expect(await res.json()).toEqual(flagsAllOn);
  });

  it('flagsOverride("all-off") answers flagsAllOff', async () => {
    server.use(flagsOverride("all-off"));
    const res = await getFlags();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(flagsAllOff);
  });

  it('flagsOverride("error") answers 503 SERVICE_UNAVAILABLE as a Problem', async () => {
    server.use(flagsOverride("error"));
    const res = await getFlags();
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/problem+json");
    expect(await res.json()).toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
  });
});
