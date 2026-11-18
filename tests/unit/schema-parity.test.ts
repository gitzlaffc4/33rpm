/**
 * The SQLite and PostgreSQL schema trees must describe the same tables, columns,
 * nullability, keys, uniques, indexes and foreign keys (column types differ by design).
 * Also checks TABLES_IN_DEPENDENCY_ORDER against the foreign keys.
 */
import { getTableConfig as pgConfig, type PgTable } from "drizzle-orm/pg-core";
import { getTableConfig as sqliteConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";

import { pgSchema, sqliteSchema } from "@/db/schema";
import { TABLES_IN_DEPENDENCY_ORDER } from "@/db/tables";

type Shape = {
  name: string;
  columns: {
    name: string;
    notNull: boolean;
    primary: boolean;
    unique: boolean;
    hasDefault: boolean;
  }[];
  primaryKeys: string[][];
  indexes: { name: string; columns: string[]; unique: boolean }[];
  foreignKeys: { columns: string[]; foreignTable: string; foreignColumns: string[] }[];
};

function shape(cfg: ReturnType<typeof sqliteConfig> | ReturnType<typeof pgConfig>): Shape {
  const sortBy = <T>(xs: T[], key: (x: T) => string) =>
    [...xs].sort((a, b) => key(a).localeCompare(key(b)));
  return {
    name: cfg.name,
    columns: sortBy(
      cfg.columns.map((c) => ({
        name: c.name,
        notNull: c.notNull,
        primary: c.primary,
        unique: c.isUnique,
        hasDefault: c.hasDefault,
      })),
      (c) => c.name,
    ),
    primaryKeys: cfg.primaryKeys.map((pk) => pk.columns.map((c) => c.name).sort()),
    indexes: sortBy(
      cfg.indexes.map((i) => ({
        name: i.config.name ?? "",
        columns: i.config.columns.map((c) => ("name" in c ? String(c.name) : "?")),
        unique: Boolean(i.config.unique),
      })),
      (i) => i.name,
    ),
    foreignKeys: sortBy(
      cfg.foreignKeys.map((fk) => {
        const ref = fk.reference();
        return {
          columns: ref.columns.map((c) => c.name),
          foreignTable: (ref.foreignTable as unknown as { [k: symbol]: string })[
            Symbol.for("drizzle:Name")
          ],
          foreignColumns: ref.foreignColumns.map((c) => c.name),
        };
      }),
      (f) => f.columns.join(","),
    ),
  };
}

const isTable = (v: unknown) =>
  typeof v === "object" && v !== null && Symbol.for("drizzle:IsDrizzleTable") in v;

const sqliteTables = Object.fromEntries(
  Object.values(sqliteSchema)
    .filter(isTable)
    .map((t) => {
      const s = shape(sqliteConfig(t as SQLiteTable));
      return [s.name, s];
    }),
);
const pgTables = Object.fromEntries(
  Object.values(pgSchema)
    .filter(isTable)
    .map((t) => {
      const s = shape(pgConfig(t as PgTable));
      return [s.name, s];
    }),
);

describe("schema parity (SQLite ⇄ PostgreSQL)", () => {
  it("defines the same tables", () => {
    expect(Object.keys(pgTables).sort()).toEqual(Object.keys(sqliteTables).sort());
  });

  it.each(Object.keys(sqliteTables))("table %s matches", (name) => {
    expect(pgTables[name]).toEqual(sqliteTables[name]);
  });
});

describe("TABLES_IN_DEPENDENCY_ORDER", () => {
  it("lists every table exactly once", () => {
    expect([...TABLES_IN_DEPENDENCY_ORDER].sort()).toEqual(Object.keys(sqliteTables).sort());
  });

  it("puts every referenced table before the tables that reference it", () => {
    const pos = new Map(TABLES_IN_DEPENDENCY_ORDER.map((t, i) => [t, i] as const));
    for (const table of Object.values(sqliteTables)) {
      for (const fk of table.foreignKeys) {
        if (fk.foreignTable === table.name) continue; // self-reference
        expect(
          pos.get(fk.foreignTable as never)!,
          `${table.name} references ${fk.foreignTable}`,
        ).toBeLessThan(pos.get(table.name as never)!);
      }
    }
  });
});
