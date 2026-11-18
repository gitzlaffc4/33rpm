/**
 * Integration-test database factory.
 *
 * TEST_DATABASE_URL selects the backend (default: SQLite):
 * - unset / file:…  → a fresh SQLite file in a temp dir per call
 * - postgres://…    → a fresh, uniquely named database per call on that server
 *                     (the URL's user needs CREATEDB; CI uses the postgres superuser)
 * Every database is migrated with the real migration set before it's returned.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Pool } from "pg";

import { openDatabase, type DbHandle } from "@/db/client";
import type { Dialect } from "@/db/dialect";
import { migrateDatabase } from "@/db/migrate";

export const MIGRATIONS_ROOT = path.resolve(import.meta.dirname, "../../drizzle");
const PG_URL = /^postgres(ql)?:\/\//i.test(process.env.TEST_DATABASE_URL ?? "")
  ? process.env.TEST_DATABASE_URL!
  : null;

export const TEST_DIALECT: Dialect = PG_URL ? "pg" : "sqlite";

export function tmpDir(prefix = "33rpm-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export type TestDb = DbHandle & { url: string; dir: string; cleanup(): Promise<void> };

/** A fresh database (not migrated). */
export async function emptyDb(): Promise<TestDb> {
  const dir = tmpDir();
  if (!PG_URL) {
    const url = `file:${path.join(dir, "33rpm.db")}`;
    const h = openDatabase({ dialect: "sqlite", url, path: path.join(dir, "33rpm.db") });
    return { ...h, url, dir, cleanup: () => h.close() };
  }
  const name = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = new Pool({ connectionString: PG_URL, max: 1 });
  await admin.query(`CREATE DATABASE "${name}"`);
  const u = new URL(PG_URL);
  u.pathname = `/${name}`;
  const url = u.toString();
  const h = openDatabase({ dialect: "pg", url }, { poolMax: 4 });
  return {
    ...h,
    url,
    dir,
    cleanup: async () => {
      await h.close();
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}

/** A fresh database with all migrations applied. */
export async function migratedDb(): Promise<TestDb> {
  const db = await emptyDb();
  await migrateDatabase(db, {
    migrationsRoot: MIGRATIONS_ROOT,
    backupsDir: path.join(db.dir, "backups"),
  });
  return db;
}
