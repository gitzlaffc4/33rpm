/**
 * JSON adapter for the copy engine: a whole-database export (portable backup) and a
 * source that reads one back. Timestamps are written as ISO strings and revived on import.
 */
import { getTableColumns } from "drizzle-orm";

import type { DbHandle } from "@/db/client";
import { TABLES_IN_DEPENDENCY_ORDER, type TableName } from "@/db/tables";
import { APP_VERSION } from "@/lib/version";
import { databaseSource, referenceTable, type CopySource, type Row, type TableCounts } from ".";

export const JSON_FORMAT = "33rpm-backup";
export const JSON_FORMAT_VERSION = 1;

export type JsonBackup = {
  format: typeof JSON_FORMAT;
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  tables: Partial<Record<TableName, Row[]>>;
};

/** Stream the database as JSON, one row at a time, so memory stays flat. */
export async function* exportJson(h: DbHandle): AsyncGenerator<string> {
  const src = databaseSource(h);
  yield `{"format":"${JSON_FORMAT}","formatVersion":${JSON_FORMAT_VERSION},"appVersion":${JSON.stringify(APP_VERSION)},"exportedAt":"${new Date().toISOString()}","tables":{`;
  const tables = TABLES_IN_DEPENDENCY_ORDER.filter((t) => t !== "app_state");
  for (const [i, name] of tables.entries()) {
    yield `${i ? "," : ""}${JSON.stringify(name)}:[`;
    let first = true;
    for await (const batch of src.rows(name, 500)) {
      for (const row of batch) {
        yield (first ? "" : ",") + JSON.stringify(row);
        first = false;
      }
    }
    yield "]";
  }
  yield "}}\n";
}

/** Property names of timestamp columns (revived from ISO strings). */
function timestampProps(name: TableName): Set<string> {
  return new Set(
    Object.entries(getTableColumns(referenceTable(name)))
      .filter(([, col]) => col.columnType === "SQLiteTimestamp")
      .map(([prop]) => prop),
  );
}

export function jsonSource(backup: JsonBackup): CopySource {
  if (backup?.format !== JSON_FORMAT) throw new Error("Not a 33rpm JSON backup");
  if (backup.formatVersion > JSON_FORMAT_VERSION)
    throw new Error("This backup was made by a newer 33rpm");
  return {
    describe: `JSON backup (${backup.exportedAt})`,
    async counts() {
      const c = {} as TableCounts;
      for (const t of TABLES_IN_DEPENDENCY_ORDER)
        c[t] = t === "app_state" ? 0 : (backup.tables[t]?.length ?? 0);
      return c;
    },
    async *rows(name, batchSize) {
      const rows = backup.tables[name] ?? [];
      const dates = timestampProps(name);
      for (let i = 0; i < rows.length; i += batchSize) {
        yield rows.slice(i, i + batchSize).map((r) => {
          const out: Row = { ...r };
          for (const p of dates)
            if (typeof out[p] === "string") out[p] = new Date(out[p] as string);
          return out;
        });
      }
    },
  };
}
