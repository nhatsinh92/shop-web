import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = __dirname;
const self = join(root, "no-use-cache.test.ts");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const sources = () => files(root).filter((file) => file !== self);

describe("checkout feature", () => {
  it("never uses 'use cache' (checkout data is user data)", () => {
    const offenders = sources().filter((file) =>
      /['"]use cache(: \w+)?['"]/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("never persists a query (persist: true)", () => {
    const offenders = sources().filter((file) =>
      /persist\s*:\s*true/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
