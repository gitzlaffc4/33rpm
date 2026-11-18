import fs from "node:fs";
import path from "node:path";

import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

import type { DbHandle } from "./client";

const MIGRATIONS_TABLE = "__drizzle_migrations";
const PG_MIGRATIONS_SCHEMA = "drizzle";
/** Advisory lock held while migrating PostgreSQL, so replicas can't race. */
const PG_LOCK_SQL = "hashtext('33rpm:migrations')";
const SNAPSHOT_PREFIX = "33rpm-pre-migrate-";
const SNAPSHOTS_TO_KEEP = 5;

type Journal = { entries: { idx: number; when: number; tag: string }[] };

export type MigrateResult = {
  applied: string[];
  snapshot: string | null;
};

function readJournal(migrationsFolder: string): Journal {
  return JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as Journal;
}

/** Migrations in the journal that the SQLite database hasn't applied yet. */
export function pendingMigrations(sqlite: Database.Database, migrationsFolder: string): string[] {
  const journal = readJournal(migrationsFolder);

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

/** Migrations in the journal that the PostgreSQL database hasn't applied yet. */
export async function pendingPgMigrations(
  client: Pick<Pool, "query">,
  migrationsFolder: string,
): Promise<string[]> {
  const journal = readJournal(migrationsFolder);
  const { rows } = await client.query<{ t: string | null }>(
    `SELECT to_regclass('${PG_MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}')::text AS t`,
  );
  let last = 0;
  if (rows[0]?.t) {
    const res = await client.query<{ last: string | null }>(
      `SELECT MAX(created_at)::text AS last FROM ${PG_MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`,
    );
    last = Number(res.rows[0]?.last ?? 0);
  }
  return journal.entries.filter((e) => e.when > last).map((e) => e.tag);
}

/**
 * Apply pending PostgreSQL migrations while holding an advisory lock, so several
 * app replicas starting at once can't race. No snapshot is taken: the app doesn't
 * bundle Postgres client tools; back up with pg_dump before upgrading.
 */
export async function runPgMigrations(opts: {
  pool: Pool;
  migrationsFolder: string;
}): Promise<MigrateResult> {
  const client = await opts.pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(${PG_LOCK_SQL})`);
    // Re-check under the lock: another replica may have just migrated.
    const pending = await pendingPgMigrations(client, opts.migrationsFolder);
    if (pending.length) {
      await migratePg(drizzlePg(client), {
        migrationsFolder: opts.migrationsFolder,
        migrationsTable: MIGRATIONS_TABLE,
        migrationsSchema: PG_MIGRATIONS_SCHEMA,
      });
    }
    return { applied: pending, snapshot: null };
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${PG_LOCK_SQL})`).catch(() => undefined);
    client.release();
  }
}

/**
 * Migrate the given database with its dialect's migration set
 * (`<migrationsRoot>/sqlite` or `<migrationsRoot>/pg`).
 */
export async function migrateDatabase(
  handle: DbHandle,
  opts: { migrationsRoot: string; backupsDir: string },
): Promise<MigrateResult> {
  if (handle.dialect === "sqlite") {
    return runMigrations({
      sqlite: handle.sqlite!,
      migrationsFolder: path.join(opts.migrationsRoot, "sqlite"),
      backupsDir: opts.backupsDir,
    });
  }
  return runPgMigrations({
    pool: handle.pool!,
    migrationsFolder: path.join(opts.migrationsRoot, "pg"),
  });
}
