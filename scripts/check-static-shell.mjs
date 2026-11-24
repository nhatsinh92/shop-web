// Fails unless "/", "/cart" and a seeded product route are listed as prerendered, so CI notices when the shell becomes dynamic.
import { readFileSync } from "node:fs";

const file = ".next/prerender-manifest.json";
let manifest;
try {
  manifest = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`check-static-shell: cannot read ${file}: ${error.message}`);
  process.exit(1);
}

const routes = Object.keys(manifest.routes ?? {});
if (!routes.includes("/")) {
  console.error('check-static-shell: "/" is not prerendered; the shell became dynamic.');
  process.exit(1);
}
// The seeded ANC Pro product page (slug from the fixtures of #52) must be prerendered too.
const productRoute = "/product/tai-nghe-khong-day-anc-pro";
if (!routes.includes(productRoute)) {
  console.error(`check-static-shell: "${productRoute}" is not prerendered.`);
  process.exit(1);
}
if (!routes.includes("/cart")) {
  console.error('check-static-shell: "/cart" is not prerendered; the cart shell became dynamic.');
  process.exit(1);
}
console.log(`check-static-shell: "/", "${productRoute}" and "/cart" are prerendered.`);
