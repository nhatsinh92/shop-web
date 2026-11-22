import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("static shell", () => {
  it.each(["src/app/layout.tsx", "src/app/(shop)/layout.tsx"])(
    "%s never reads cookies, headers or searchParams",
    (file) => {
      const raw = readFileSync(join(process.cwd(), file), "utf8");
      // Comments may mention the forbidden APIs; only code counts.
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(/cookies\(/);
      expect(source).not.toMatch(/headers\(/);
      expect(source).not.toMatch(/searchParams/);
    },
  );
});
