#!/bin/sh
# `33rpm` admin CLI wrapper, installed in the image as /usr/local/bin/33rpm.
#   docker exec -it 33rpm 33rpm reset-password me@example.com
# `docker exec` runs as root by default; drop to PUID:PGID like the entrypoint does,
# so the CLI never creates root-owned files (e.g. SQLite WAL) the app can't write.
set -eu
if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid="${PUID:-1000}" --regid="${PGID:-1000}" --clear-groups --inh-caps=-all \
    node /app/dist/cli.js "$@"
fi
exec node /app/dist/cli.js "$@"
