/**
 * The copy engine (docs/addendum-01-postgres-support.md → "Moving between databases").
 * Copies every table, in dependency order, preserving ids, from a source to a target:
 * database → database (SQLite ⇄ PostgreSQL), database → JSON, JSON → database.
 *
 * Rows travel as the JS values Drizzle produces (Date, objects for JSON columns, booleans),
 * so they convert between dialects for free.
 */
import { asc, count, getTableName, is, type SQL } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";

import type { DbHandle } from "@/db/client";
import { sqliteSchema } from "@/db/schema";
import { TABLES_IN_DEPENDENCY_ORDER, type TableName } from "@/db/tables";
import { getSearchIndex } from "@/db/search";
import { withTransaction } from "@/db/tx";

export type Row = Record<string, unknown>;
export type TableCounts = Record<TableName, number>;

/** Schema export key (e.g. "masterArtist") for each SQL table name ("master_artist"). */
const KEY_BY_TABLE = new Map<string, keyof typeof sqliteSchema>();
for (const [key, value] of Object.entries(sqliteSchema)) {
  if (is(value, SQLiteTable))
    KEY_BY_TABLE.set(getTableName(value), key as keyof typeof sqliteSchema);
}

export function tableOf(h: DbHandle, name: TableName) {
  const key = KEY_BY_TABLE.get(name);
  if (!key) throw new Error(`Unknown table ${name}`);
  return (h.t as unknown as Record<string, SQLiteTable>)[key];
}

/** The SQLite-tree table (the reference for column modes in both dialects). */
export function referenceTable(name: TableName): SQLiteTable {
  return (sqliteSchema as unknown as Record<string, SQLiteTable>)[KEY_BY_TABLE.get(name)!];
}

/** Columns that identify a row, for stable paging. */
function orderColumns(name: TableName): SQL[] {
  const table = (sqliteSchema as unknown as Record<string, SQLiteTable>)[KEY_BY_TABLE.get(name)!];
  const cfg = getTableConfig(table);
  const pk = cfg.columns.filter((c) => c.primary).map((c) => c.name);
  for (const k of cfg.primaryKeys) pk.push(...k.columns.map((c) => c.name));
  return pk.map((n) => asc(cfg.columns.find((c) => c.name === n)!));
}

export interface CopySource {
  describe: string;
  counts(): Promise<TableCounts>;
  rows(table: TableName, batchSize: number): AsyncIterable<Row[]>;
}

export async function countRows(h: DbHandle): Promise<TableCounts> {
  const out = {} as TableCounts;
  for (const name of TABLES_IN_DEPENDENCY_ORDER) {
    const [{ n }] = await h.db.select({ n: count() }).from(tableOf(h, name));
    out[name] = Number(n);
  }
  return out;
}

export function databaseSource(
  h: DbHandle,
  describe = h.dialect === "pg" ? "PostgreSQL" : "SQLite",
): CopySource {
  return {
    describe,
    counts: () => countRows(h),
    async *rows(name, batchSize) {
      const table = tableOf(h, name);
      const order = orderColumns(name);
      for (let offset = 0; ; offset += batchSize) {
        const batch = (await h.db
          .select()
          .from(table)
          .orderBy(...order)
          .limit(batchSize)
          .offset(offset)) as Row[];
        if (batch.length) yield batch;
        if (batch.length < batchSize) return;
      }
    },
  };
}

/** Users or catalog rows present? (A copy target must be empty.) */
export async function hasData(counts: TableCounts) {
  return TABLES_IN_DEPENDENCY_ORDER.some((t) => t !== "app_state" && counts[t] > 0);
}

export type CopyReport = {
  source: string;
  target: string;
  counts: TableCounts;
  durationMs: number;
};

export class CopyError extends Error {}

/**
 * Copy everything from `source` into the empty `target` in ONE transaction; verify row
 * counts per table and roll back on any mismatch. `app_state` (setup codes and the like)
 * is not copied: it belongs to the running instance.
 */
export async function copyInto(
  source: CopySource,
  target: DbHandle,
  opts: { batchSize?: number; onTable?: (name: TableName, rows: number) => void } = {},
): Promise<CopyReport> {
  const started = Date.now();
  const batchSize = opts.batchSize ?? 500;
  const targetCounts = await countRows(target);
  if (await hasData(targetCounts)) {
    throw new CopyError(
      "The target database is not empty (it has users or catalog data). Refusing to copy.",
    );
  }
  const expected = await source.counts();
  const tables = TABLES_IN_DEPENDENCY_ORDER.filter((t) => t !== "app_state");
  await withTransaction(async (tx) => {
    for (const name of tables) {
      const table = tableOf(target, name);
      let n = 0;
      for await (const batch of source.rows(name, batchSize)) {
        await tx.insert(table).values(batch);
        n += batch.length;
      }
      const [{ c }] = await tx.select({ c: count() }).from(table);
      if (Number(c) !== expected[name] || n !== expected[name]) {
        throw new CopyError(
          `Row count mismatch in ${name}: source ${expected[name]}, copied ${Number(c)}`,
        );
      }
      opts.onTable?.(name, n);
    }
  }, target);
  // The search index is derived data: rebuild it for the copied catalog.
  await getSearchIndex(target).rebuild();
  return {
    source: source.describe,
    target: target.dialect === "pg" ? "PostgreSQL" : "SQLite",
    counts: { ...expected, app_state: 0 },
    durationMs: Date.now() - started,
  };
}
