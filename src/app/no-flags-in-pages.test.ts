import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return /^(page|layout)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe("flags are read only inside holes", () => {
  const files = routeFiles(join(process.cwd(), "src/app"));

  it("finds the page and layout files", () => {
    expect(files.length).toBeGreaterThan(2);
  });

  it.each(files.map((f) => [f.replace(process.cwd() + "/", ""), f]))(
    "%s does not import @/lib/flags",
    (_name, file) => {
      const raw = readFileSync(file!, "utf8");
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(source).not.toMatch(/@\/lib\/flags/);
    },
  );
});
