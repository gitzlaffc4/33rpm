import { AsyncLocalStorage } from "node:async_hooks";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Db, DbHandle } from "./client";
import { getDb } from "./index";

/**
 * A tiny FIFO async mutex. better-sqlite3 has one connection per process, so a
 * transaction that awaits (even only on DB calls) could otherwise interleave with
 * other requests' statements on the same connection.
 */
class Mutex {
  #tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(fn, fn);
    this.#tail = result.catch(() => undefined);
    return result;
  }
}

const sqliteLock = new Mutex();
/** Set only inside the async context of the transaction body (not other requests). */
const sqliteTx = new AsyncLocalStorage<true>();

/**
 * Run `fn` in a database transaction on the app database.
 *
 * Rules (docs/addendum-01-postgres-support.md, rule 10): the body does DB work only.
 * Never await network calls (Discogs, MusicBrainz, ...) inside it. Nested calls are
 * not supported.
 *
 * - PostgreSQL: Drizzle's transaction on a pooled connection.
 * - SQLite: BEGIN IMMEDIATE / COMMIT on the single connection, serialized with
 *   other writes through a process-wide lock (see `exclusive`).
 */
export async function withTransaction<T>(
  fn: (tx: Db) => Promise<T>,
  handle: DbHandle = getDb(),
): Promise<T> {
  if (handle.dialect === "pg") {
    const pg = handle.db as unknown as NodePgDatabase;
    return pg.transaction((tx) => fn(tx as unknown as Db));
  }
  if (sqliteTx.getStore()) throw new Error("Nested withTransaction() is not supported");
  return sqliteLock.run(async () => {
    const sqlite = handle.sqlite!;
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = await sqliteTx.run(true, () => fn(handle.db));
      sqlite.exec("COMMIT");
      return result;
    } catch (e) {
      if (sqlite.inTransaction) sqlite.exec("ROLLBACK");
      throw e;
    }
  });
}

/**
 * Run a write outside an explicit transaction. On SQLite it waits for any open
 * transaction so the write can't be swallowed into (and rolled back with) it.
 * On PostgreSQL it runs immediately.
 */
export async function exclusive<T>(fn: () => Promise<T>, handle: DbHandle = getDb()): Promise<T> {
  // Inside our own transaction body: already holding the lock.
  if (handle.dialect === "pg" || sqliteTx.getStore()) return fn();
  return sqliteLock.run(fn);
}
