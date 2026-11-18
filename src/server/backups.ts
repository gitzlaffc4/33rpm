import fs from "node:fs";
import path from "node:path";

import type { DbHandle } from "@/db/client";
import { snapshotDatabase } from "@/db/migrate";

export const AUTO_PREFIX = "33rpm-auto-";

/** Newest automatic snapshot's time (from its file), or 0. */
export function lastAutoSnapshot(backupsDir: string): number {
  try {
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => f.startsWith(AUTO_PREFIX) && f.endsWith(".db"));
    return Math.max(0, ...files.map((f) => fs.statSync(path.join(backupsDir, f)).mtimeMs));
  } catch {
    return 0;
  }
}

/** Take a snapshot if the last one is older than the interval. Returns the file or null. */
export function maybeSnapshot(
  handle: DbHandle,
  opts: { backupsDir: string; intervalHours: number; keep: number },
  now = Date.now(),
) {
  if (handle.dialect !== "sqlite" || opts.intervalHours <= 0) return null;
  if (now - lastAutoSnapshot(opts.backupsDir) < opts.intervalHours * 3_600_000) return null;
  return snapshotDatabase(handle.sqlite!, opts.backupsDir, new Date(now), {
    prefix: AUTO_PREFIX,
    keep: opts.keep,
  });
}

const g = globalThis as unknown as { __33rpmBackupTimer?: ReturnType<typeof setInterval> };

/**
 * Automatic SQLite snapshots (VACUUM INTO, consistent while the app runs). Checked hourly,
 * so restarts don't reset the schedule. PostgreSQL: use pg_dump (see README).
 */
export function startBackupSchedule(
  handle: DbHandle,
  opts: { backupsDir: string; intervalHours: number; keep: number },
) {
  if (handle.dialect !== "sqlite" || opts.intervalHours <= 0) return;
  const tick = () => {
    try {
      const file = maybeSnapshot(handle, opts);
      if (file) console.log(`[33rpm] Backup written: ${file}`);
    } catch (e) {
      console.error(`[33rpm] Automatic backup failed: ${(e as Error).message}`);
    }
  };
  if (g.__33rpmBackupTimer) clearInterval(g.__33rpmBackupTimer);
  g.__33rpmBackupTimer = setInterval(tick, 3_600_000);
  g.__33rpmBackupTimer.unref?.();
  // First check shortly after startup, off the boot path.
  setTimeout(tick, 60_000).unref?.();
}
