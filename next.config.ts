import type { NextConfig } from "next";

// Locally, /api/* is rewritten to the gateway so auth cookies stay same-origin.
// In production an ingress routes /api/* to the gateway and this rewrite is unused.
const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    // The default resolves to the server stand-in; browsers get the real MSW worker entry.
    resolveAlias: {
      "./start-mock-worker": {
        browser: "./src/lib/mocking/start-mock-worker.ts",
        default: "./src/lib/mocking/start-mock-worker.server.ts",
      },
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${gatewayUrl}/api/:path*` }];
  },
};

export default nextConfig;
