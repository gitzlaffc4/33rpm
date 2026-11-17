import type { NextConfig } from "next";

import pkg from "./package.json" with { type: "json" };

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // Native module: keep it out of the bundle and trace it into the standalone output.
  serverExternalPackages: ["better-sqlite3"],
  // Files read at runtime that tracing can't see (or only sees for the build host):
  // - migrations, read from disk at startup
  // - better-sqlite3's glibc prebuilds for BOTH image architectures. Tracing on its
  //   own only copies the binary matching the build machine's process.arch.
  outputFileTracingIncludes: {
    "/**": [
      "./drizzle/**/*",
      "./node_modules/better-sqlite3/prebuilds/linux-x64.node",
      "./node_modules/better-sqlite3/prebuilds/linux-arm64.node",
    ],
  },
  // package.json is the single source of truth for the version.
  env: { APP_VERSION: pkg.version, APP_COMMIT: process.env.APP_COMMIT ?? "" },
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
