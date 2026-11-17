#!/bin/sh
# 33rpm container entrypoint.
#
# - Started as root (default): ensure /data and its subdirectories exist and are
#   owned by PUID:PGID (default 1000:1000), then re-exec as that user. Ownership is
#   fixed non-recursively for speed; see the README if you change PUID later.
# - Started as a non-root user (`user:` in compose / --user): no ownership
#   changes, only checks.
# Either way, the app refuses to start unless /data is writable.
set -eu

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  if [ "$PUID" = "0" ]; then
    echo "[33rpm] Refusing to run as root (PUID=0). Choose a non-root PUID/PGID." >&2
    exit 1
  fi
  mkdir -p "$DATA_DIR" "$DATA_DIR/images" "$DATA_DIR/backups"
  # Best effort: chown may be refused on some network filesystems (e.g. NFS root_squash).
  chown "$PUID:$PGID" "$DATA_DIR" "$DATA_DIR/images" "$DATA_DIR/backups" 2>/dev/null || true
  for f in "$DATA_DIR"/33rpm.db "$DATA_DIR"/33rpm.db-wal "$DATA_DIR"/33rpm.db-shm; do
    [ -e "$f" ] && { chown "$PUID:$PGID" "$f" 2>/dev/null || true; }
  done
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups --inh-caps=-all \
    "$0" "$@"
fi

fail() {
  uid="$(id -u)"; gid="$(id -g)"
  cat >&2 <<MSG

[33rpm] ERROR: $1
[33rpm] The app runs as uid=$uid gid=$gid and needs to write to $DATA_DIR.
[33rpm] Fix one of:
[33rpm]   - set PUID/PGID to the owner of your data directory on the host, or
[33rpm]   - on the host: sudo chown -R $uid:$gid /path/to/your/data
[33rpm] See "Data volume & permissions" in the README.

MSG
  exit 1
}

for d in "$DATA_DIR" "$DATA_DIR/images" "$DATA_DIR/backups"; do
  mkdir -p "$d" 2>/dev/null || fail "cannot create $d"
  probe="$d/.write-test.$$"
  ( : > "$probe" ) 2>/dev/null || fail "$d is not writable"
  rm -f "$probe"
done
for f in "$DATA_DIR"/33rpm.db "$DATA_DIR"/33rpm.db-wal "$DATA_DIR"/33rpm.db-shm; do
  if [ -e "$f" ] && [ ! -w "$f" ]; then fail "$f is not writable"; fi
done

exec "$@"
