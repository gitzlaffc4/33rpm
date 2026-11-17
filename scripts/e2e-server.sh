#!/usr/bin/env bash
# Serve the production build for Playwright with a fresh, throwaway data dir.
# Server output is tee'd to e2e/.server.log so the test can read the setup code
# exactly as an operator would (from the logs).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=.e2e
rm -rf "$OUT" && mkdir -p "$OUT"
cp -r .next/standalone/. "$OUT/"
cp -r .next/static "$OUT/.next/static"
[ -d public ] && cp -r public "$OUT/public"
export NODE_ENV=production PORT="${E2E_PORT:-3100}" HOSTNAME=127.0.0.1
export APP_URL="http://localhost:${PORT}" DATA_DIR="$PWD/$OUT/data"
export AUTH_SECRET="e2e-only-secret-not-for-production-use-000000"
export NEXT_TELEMETRY_DISABLED=1
exec node "$OUT/server.js" 2>&1 | tee e2e/.server.log
