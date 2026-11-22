// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

describe("POST /hooks/revalidate", () => {
  it("delegates to the handler (404 without a configured secret)", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    const res = await POST(new Request("http://localhost/hooks/revalidate", { method: "POST" }));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });
});
