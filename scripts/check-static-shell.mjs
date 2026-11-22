// Fails unless "/" is listed as prerendered, so CI notices when the shell becomes dynamic.
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
console.log('check-static-shell: "/" is prerendered.');
