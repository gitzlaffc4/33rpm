# syntax=docker/dockerfile:1.7
#
# 33rpm — single image for linux/amd64 and linux/arm64.
# Debian slim (glibc) so better-sqlite3's bundled prebuilt binaries are used on
# both architectures; no compiler toolchain is needed.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- dependencies (cached unless the lockfile changes) ---
FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ---
FROM base AS runtime
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
