import fs from "node:fs";
import path from "node:path";

import type { DbHandle } from "@/db/client";
import { countRows, hasData } from "@/db/copy";
import { describeCounts, inspectSource, type SourceInfo } from "@/db/copy/library-import";
import type { Env } from "@/env";

/**
 * "Import existing library" offer, computed once at startup (addendum, Phase 4): when the
 * active database is empty and a source with data exists (MIGRATE_FROM_URL, or the default
 * SQLite file while running on PostgreSQL).
 */
export type LibraryOffer = {
  source: SourceInfo;
  summary: string;
  /** The default SQLite file: renamed after a successful import. */
  isDefaultSqlite: boolean;
};

const g = globalThis as unknown as {
  __33rpmOffer?: LibraryOffer | null;
  __33rpmImporting?: boolean;
};

export function getLibraryOffer() {
  return g.__33rpmOffer ?? null;
}
export function clearLibraryOffer() {
  g.__33rpmOffer = null;
}
export function isImporting() {
  return g.__33rpmImporting === true;
}
export function setImporting(v: boolean) {
  g.__33rpmImporting = v;
}

export async function computeLibraryOffer(handle: DbHandle, env: Env, migrationsRoot: string) {
  g.__33rpmOffer = null;
  if (await hasData(await countRows(handle))) return null;
  let url = env.MIGRATE_FROM_URL;
  let isDefaultSqlite = false;
  if (!url && handle.dialect === "pg") {
    const file = path.join(env.DATA_DIR, "33rpm.db");
    if (fs.existsSync(file)) {
      url = `file:${file}`;
      isDefaultSqlite = true;
    }
  }
  if (!url) return null;
  try {
    const source = await inspectSource(url, handle, migrationsRoot);
    if (!(await hasData(source.counts))) return null;
    g.__33rpmOffer = { source, summary: describeCounts(source.counts), isDefaultSqlite };
    return g.__33rpmOffer;
  } catch (e) {
    console.error(
      `[33rpm] Couldn't read the library to import (${url.replace(/\/\/[^@]*@/, "//***@")}): ${(e as Error).message}`,
    );
    return null;
  }
}
