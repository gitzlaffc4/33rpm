import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const MIGRATIONS_TABLE = "__drizzle_migrations";
const SNAPSHOT_PREFIX = "33rpm-pre-migrate-";
const SNAPSHOTS_TO_KEEP = 5;

type Journal = { entries: { idx: number; when: number; tag: string }[] };

export type MigrateResult = {
  applied: string[];
  snapshot: string | null;
};

/** Migrations in the journal that the database hasn't applied yet. */
export function pendingMigrations(sqlite: Database.Database, migrationsFolder: string): string[] {
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as Journal;

  const hasTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(MIGRATIONS_TABLE);
  // Drizzle applies every migration newer than the most recently applied one.
  const last = hasTable
    ? ((
        sqlite.prepare(`SELECT MAX(created_at) AS last FROM ${MIGRATIONS_TABLE}`).get() as {
          last: number | null;
        }
      ).last ?? 0)
    : 0;

  return journal.entries.filter((e) => e.when > last).map((e) => e.tag);
}

function hasUserTables(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { n: number };
  return row.n > 0;
}

/**
 * Copy the live database to `backupsDir` with `VACUUM INTO` (consistent even in
 * WAL mode) and prune old pre-migration snapshots.
 */
export function snapshotDatabase(sqlite: Database.Database, backupsDir: string, now = new Date()) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupsDir, `${SNAPSHOT_PREFIX}${stamp}.db`);
  sqlite.prepare("VACUUM INTO ?").run(file);

  const old = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith(SNAPSHOT_PREFIX) && f.endsWith(".db"))
    .sort()
    .slice(0, -SNAPSHOTS_TO_KEEP);
  for (const f of old) fs.rmSync(path.join(backupsDir, f), { force: true });

  return file;
}

/**
 * Apply pending migrations. If the database already has data and something is
 * pending, snapshot it to `backupsDir` first.
 */
export function runMigrations(opts: {
  sqlite: Database.Database;
  migrationsFolder: string;
  backupsDir: string;
}): MigrateResult {
  const { sqlite, migrationsFolder, backupsDir } = opts;
  const pending = pendingMigrations(sqlite, migrationsFolder);
  if (pending.length === 0) return { applied: [], snapshot: null };

  const snapshot = hasUserTables(sqlite) ? snapshotDatabase(sqlite, backupsDir) : null;
  migrate(drizzle(sqlite), { migrationsFolder, migrationsTable: MIGRATIONS_TABLE });
  return { applied: pending, snapshot };
}
