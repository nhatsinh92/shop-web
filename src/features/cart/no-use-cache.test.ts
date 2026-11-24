import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = __dirname;
const self = join(root, "no-use-cache.test.ts");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe("cart feature", () => {
  it("never uses 'use cache' (the cart is user data)", () => {
    const offenders = files(root)
      .filter((file) => file !== self)
      .filter((file) => /['"]use cache(: \w+)?['"]/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
