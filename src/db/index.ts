import { getEnv } from "@/env";
import { openDatabase, type DbHandle } from "./client";
import { parseDatabaseUrl } from "./dialect";

export type { Db, DbHandle } from "./client";

// Cache on globalThis so dev-mode HMR doesn't open a new connection per reload.
const globalForDb = globalThis as unknown as { __33rpmDb?: DbHandle };

/**
 * The app's database handle for the configured DATABASE_URL. Opened lazily on first
 * use so `next build` never touches the database. Used by the server and the CLI.
 */
export function getDb(): DbHandle {
  if (!globalForDb.__33rpmDb) {
    const env = getEnv();
    globalForDb.__33rpmDb = openDatabase(parseDatabaseUrl(env.DATABASE_URL), {
      poolMax: env.DATABASE_POOL_MAX,
      ssl: env.DATABASE_SSL,
    });
  }
  return globalForDb.__33rpmDb;
}

/** Test/CLI helper: use a specific handle as the app database. */
export function setDb(handle: DbHandle | undefined) {
  globalForDb.__33rpmDb = handle;
}
