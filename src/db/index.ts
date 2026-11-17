import "server-only";

import type Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { getEnv } from "@/env";
import { openSqlite } from "./sqlite";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

// Cache on globalThis so dev-mode HMR doesn't open a new connection per reload.
const globalForDb = globalThis as unknown as { __33rpmDb?: Db };

/**
 * The app's Drizzle client. Opened lazily on first use so `next build` never
 * touches the database.
 */
export function getDb(): Db {
  if (!globalForDb.__33rpmDb) {
    const sqlite = openSqlite(getEnv().DATABASE_PATH);
    globalForDb.__33rpmDb = drizzle(sqlite, { schema });
  }
  return globalForDb.__33rpmDb;
}

export { schema };
