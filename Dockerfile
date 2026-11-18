# syntax=docker/dockerfile:1.7
#
# 33rpm — single image for linux/amd64 and linux/arm64.
# Debian slim (glibc) so better-sqlite3's bundled prebuilt binaries are used on
# both architectures; no compiler toolchain is needed.

# Base image pinned by digest (multi-arch index); Dependabot keeps the digest current.
FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- dependencies (cached unless the lockfile changes) ---
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# --- build ---
FROM base AS build
# Git commit baked into the app (Settings → About, /api/health). The version comes
# from package.json at build time.
ARG REVISION=unknown
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN APP_COMMIT="${REVISION}" npm run build
# Fail the build (on each architecture) unless better-sqlite3's prebuilt binary for
# this platform is in the standalone output and actually loads. No compile step
# exists: the binary ships inside the npm package (see .npmrc).
RUN node -e "const D=require('./.next/standalone/node_modules/better-sqlite3'); \
  const v=new D(':memory:').prepare('select sqlite_version() v').get().v; \
  console.log('better-sqlite3 OK on '+process.platform+'-'+process.arch+', SQLite '+v)" \
 && test -f .next/standalone/node_modules/better-sqlite3/prebuilds/linux-x64.node \
 && test -f .next/standalone/node_modules/better-sqlite3/prebuilds/linux-arm64.node

# --- runtime ---
FROM base AS runtime
# VERSION should be package.json's version (the release workflows pass it).
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="33rpm" \
      org.opencontainers.image.description="Self-hosted library for your physical music collection" \
      org.opencontainers.image.source="https://github.com/gitzlaffc4/33rpm" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chmod=0755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Next's runtime cache must be writable by whatever PUID the app ends up running as.
RUN mkdir -p /data .next/cache && chown node:node /data && chmod 1777 .next/cache

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# The entrypoint starts as root only to prepare /data, then drops to PUID:PGID
# (default 1000:1000, the image's `node` user). It never runs the app as root.
# The entrypoint `exec`s into Node, which becomes PID 1; Next's server handles
# SIGTERM/SIGINT itself for graceful shutdown, so no init process is needed.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
