// ESLint flat config. Protected path: changes need the infra-change label and human approval.
import pluginQuery from "@tanstack/eslint-plugin-query";
import boundaries from "eslint-plugin-boundaries";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const HEX_COLOUR = "/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/";
const HEX_MESSAGE =
  "Raw hex colours are not allowed. Use a theme token from src/app/globals.css (bg-brand, text-ink, ...).";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...pluginQuery.configs["flat/recommended"],

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "public/mockServiceWorker.js",
    "src/lib/api/generated/**",
    "design/**",
  ]),

  // Feature boundaries: app composes features; features never import each other.
  {
    files: ["src/**/*.{ts,tsx}", "mocks/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "app", pattern: "src/app", partialMatch: false },
        { type: "feature", pattern: "src/features/*", partialMatch: false, capture: ["feature"] },
        { type: "ui", pattern: "src/components/ui", partialMatch: false },
        { type: "lib", pattern: "src/lib", partialMatch: false },
        { type: "mocks", pattern: "mocks", partialMatch: false },
      ],
      // src/proxy.ts (Phase 2) is a single file, so it is classified by a file descriptor.
      "boundaries/files": [{ pattern: "src/proxy.ts", category: "proxy" }],
    },
    rules: {
      "boundaries/no-unknown-files": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: { to: { element: { type: ["app", "ui", "lib"] } } },
            },
            {
              from: { element: { type: "app" } },
              allow: { to: { element: { type: "feature", fileInternalPath: "index.ts" } } },
              message: "app/ may import a feature only through its index.ts",
            },
            {
              from: { element: { type: "feature" } },
              allow: { to: { element: { type: ["ui", "lib"] } } },
            },
            {
              from: { element: { type: "ui" } },
              allow: { to: { element: { type: ["ui", "lib"] } } },
            },
            {
              from: { element: { type: "lib" } },
              allow: { to: { element: { type: ["lib", "mocks"] } } },
            },
            {
              from: { file: { categories: "proxy" } },
              allow: { to: { element: { type: "lib" } } },
            },
            {
              from: { element: { type: "mocks" } },
              allow: { to: { element: { type: ["mocks", "lib"] } } },
            },
            {
              from: { element: { type: "feature" } },
              disallow: { to: { element: { type: "feature" } } },
              message:
                "Features must not import other features. Compose them in src/app, or move shared code to src/lib.",
            },
          ],
        },
      ],
    },
  },

  // Colours come from theme tokens only.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${HEX_COLOUR}]`, message: HEX_MESSAGE },
        { selector: `TemplateElement[value.raw=${HEX_COLOUR}]`, message: HEX_MESSAGE },
      ],
    },
  },

  // Tests may import from anywhere inside the feature and from mocks.
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: { "boundaries/dependencies": "off" },
  },
]);
