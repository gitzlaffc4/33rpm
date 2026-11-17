import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { drizzle } from "drizzle-orm/better-sqlite3";

import { runMigrations } from "@/db/migrate";
import * as schema from "@/db/schema";
import { openSqlite } from "@/db/sqlite";

export const MIGRATIONS = path.resolve(__dirname, "../drizzle");

export function tmpDir(prefix = "33rpm-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A migrated, file-backed SQLite database in a fresh temp dir. */
export function migratedDb() {
  const dir = tmpDir();
  const sqlite = openSqlite(path.join(dir, "33rpm.db"));
  runMigrations({ sqlite, migrationsFolder: MIGRATIONS, backupsDir: path.join(dir, "backups") });
  return { dir, sqlite, db: drizzle(sqlite, { schema }) };
}
