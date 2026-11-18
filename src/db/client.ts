import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import type { DatabaseTarget, Dialect } from "./dialect";
import { pgSchema, sqliteSchema, type Schema } from "./schema";

/**
 * The query-builder type repos are written against. At runtime it is either a
 * better-sqlite3 or a node-postgres Drizzle instance; repos only use the
 * awaitable query API both share (no `.run()/.get()/.all()`), and the CI
 * matrix runs the integration tests on both.
 */
export type Db = BetterSQLite3Database<Schema>;

export type DbHandle = {
  dialect: Dialect;
  db: Db;
  /** The active dialect's tables, typed as the SQLite tree (see schema/index.ts). */
  t: Schema;
  /** Raw better-sqlite3 connection (SQLite only). */
  sqlite?: Database.Database;
  /** Connection pool (PostgreSQL only). */
  pool?: Pool;
  close(): Promise<void>;
};

export type OpenOptions = {
  /** Open without write access: SQLite readonly + must exist; Postgres read-only transactions. */
  readOnly?: boolean;
  poolMax?: number;
  /** PostgreSQL TLS: "true" verifies, "require" encrypts without verifying, "false" disables. */
  ssl?: "true" | "false" | "require";
};

/** Open a SQLite file with the pragmas 33rpm expects. Creates parent dirs (read-write only). */
export function openSqlite(file: string, opts: { readOnly?: boolean } = {}): Database.Database {
  if (opts.readOnly) {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    return db;
  }
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

function pgSsl(ssl: OpenOptions["ssl"]): PoolConfig["ssl"] {
  if (ssl === "true") return { rejectUnauthorized: true };
  if (ssl === "require") return { rejectUnauthorized: false };
  if (ssl === "false") return false;
  return undefined; // follow the URL (e.g. ?sslmode=require)
}

export function openDatabase(target: DatabaseTarget, opts: OpenOptions = {}): DbHandle {
  if (target.dialect === "sqlite") {
    const sqlite = openSqlite(target.path, { readOnly: opts.readOnly });
    return {
      dialect: "sqlite",
      db: drizzleSqlite(sqlite, { schema: sqliteSchema }),
      t: sqliteSchema,
      sqlite,
      close: async () => {
        sqlite.close();
      },
    };
  }

  const pool = new Pool({
    connectionString: target.url,
    max: opts.poolMax ?? 10,
    ssl: pgSsl(opts.ssl),
    // Read-only source connections (Phase 4 copy engine): every transaction read-only.
    options: opts.readOnly ? "-c default_transaction_read_only=on" : undefined,
  });
  // An idle client can be dropped by the server (restart, failover, admin action).
  // Without a listener node-postgres would crash the process; the pool replaces the
  // client on next use, so log it, except while we're deliberately shutting down.
  let closing = false;
  pool.on("error", (err) => {
    if (!closing) console.error(`[33rpm] PostgreSQL idle connection error: ${err.message}`);
  });
  return {
    dialect: "pg",
    db: drizzlePg(pool, { schema: pgSchema }) as unknown as Db,
    t: pgSchema as unknown as Schema,
    pool,
    close: async () => {
      closing = true;
      await pool.end();
    },
  };
}
