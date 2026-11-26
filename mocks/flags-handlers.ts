import type { components } from "../src/lib/api/generated/core";
import { flagsAllOff, flagsAllOn } from "./fixtures/flags";
import { coreHttp } from "./http";

type Problem = components["schemas"]["Problem"];

const FLAGS_CACHE_CONTROL = "public, max-age=5";

const unavailableProblem: Problem = {
  type: "about:blank",
  title: "Unavailable",
  status: 503,
  code: "SERVICE_UNAVAILABLE",
};

const flagsHandler = (scenario: "all-on" | "all-off" | "error") =>
  coreHttp.get("/api/flags", ({ response }) => {
    if (scenario === "error") {
      return response(503).json(unavailableProblem, {
        headers: { "Content-Type": "application/problem+json" },
      });
    }
    return response(200).json(scenario === "all-off" ? flagsAllOff : flagsAllOn, {
      headers: { "Cache-Control": FLAGS_CACHE_CONTROL },
    });
  });

/** Default: all flags on. */
export const flagsHandlers = [flagsHandler("all-on")];

/** Per-scenario override for `server.use(...)` in tests and the dev mock. */
export const flagsOverride = (scenario: "all-on" | "all-off" | "error") => flagsHandler(scenario);
