import type { NextConfig } from "next";

import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Native module: keep it out of the bundle and trace it into the standalone output.
  serverExternalPackages: ["better-sqlite3"],
  // Migrations are read from disk at startup; make sure standalone output includes them.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  env: { APP_VERSION: pkg.version },
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
