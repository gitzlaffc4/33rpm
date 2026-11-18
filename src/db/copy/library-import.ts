/**
 * "Import existing library" (startup flow) and `db:copy` share this: open a source
 * read-only, check its migration version, copy it into an empty target, write a log.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openDatabase, openSqlite, type DbHandle } from "@/db/client";
import { parseDatabaseUrl, redactDatabaseUrl, type DatabaseTarget } from "@/db/dialect";
import { migrateDatabase, schemaVersion } from "@/db/migrate";
import {
  copyInto,
  countRows,
  CopyError,
  databaseSource,
  hasData,
  type CopyReport,
  type TableCounts,
} from ".";

export type SourceInfo = {
  url: string;
  redacted: string;
  dialect: "sqlite" | "pg";
  counts: TableCounts;
  /** "ok", or why it can't be used as-is. */
  compatibility: "ok" | "older-sqlite" | "older-pg" | "newer";
  sourceVersion: number;
  targetVersion: number;
};

export function describeCounts(c: TableCounts) {
  const parts = [
    [c.copy, "copy", "copies"],
    [c.wishlist_item, "wishlist item", "wishlist items"],
    [c.release, "release", "releases"],
    [c.user, "user", "users"],
  ] as const;
  return parts
    .map(([n, one, many]) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`)
    .join(", ");
}

export async function inspectSource(
  url: string,
  target: DbHandle,
  migrationsRoot: string,
): Promise<SourceInfo> {
  const parsed = parseDatabaseUrl(url);
  if (parsed.dialect === "sqlite" && !fs.existsSync(parsed.path)) {
    throw new CopyError(`Source SQLite file not found: ${parsed.path}`);
  }
  const src = openDatabase(parsed, { readOnly: true, poolMax: 2 });
  try {
    const [sv, tv] = await Promise.all([
      schemaVersion(src, migrationsRoot),
      schemaVersion(target, migrationsRoot),
    ]);
    // The target is always migrated to everything this build knows before copying.
    const compatibility = sv.newer
      ? "newer"
      : sv.applied < tv.known
        ? parsed.dialect === "sqlite"
          ? "older-sqlite"
          : "older-pg"
        : "ok";
    // An older source may lack newer tables: count only when compatible.
    const counts = compatibility === "ok" ? await countRows(src) : await safeCounts(src);
    return {
      url,
      redacted: redactDatabaseUrl(url),
      dialect: parsed.dialect,
      counts,
      compatibility,
      sourceVersion: sv.applied,
      targetVersion: tv.known,
    };
  } finally {
    await src.close();
  }
}

/** Counts that tolerate missing tables (older schema). */
async function safeCounts(h: DbHandle): Promise<TableCounts> {
  try {
    return await countRows(h);
  } catch {
    const c = {} as TableCounts;
    for (const t of ["user", "copy", "release", "wishlist_item"] as const) {
      try {
        const res =
          h.dialect === "sqlite"
            ? (h.sqlite!.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number })
            : { n: 0 };
        (c as Record<string, number>)[t] = res.n;
      } catch {
        (c as Record<string, number>)[t] = 0;
      }
    }
    return c;
  }
}

/**
 * Open the source for copying. An older SQLite source is copied to a temp file and
 * migrated there (the original is never written); an older PostgreSQL source is refused.
 */
async function openSource(
  info: SourceInfo,
  migrationsRoot: string,
): Promise<{ handle: DbHandle; cleanup: () => Promise<void> }> {
  const parsed = parseDatabaseUrl(info.url) as DatabaseTarget;
  if (info.compatibility === "newer") {
    throw new CopyError("The source was used by a newer version of 33rpm. Upgrade 33rpm first.");
  }
  if (info.compatibility === "older-pg") {
    throw new CopyError(
      "The PostgreSQL source is on an older schema. Start the old instance once with this version (DATABASE_URL pointing at it) so it migrates, then import again.",
    );
  }
  if (info.compatibility === "older-sqlite" && parsed.dialect === "sqlite") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "33rpm-import-"));
    const tmp = path.join(dir, "source.db");
    const ro = openSqlite(parsed.path, { readOnly: true });
    try {
      await ro.backup(tmp);
    } finally {
      ro.close();
    }
    const handle = openDatabase({ dialect: "sqlite", url: `file:${tmp}`, path: tmp });
    await migrateDatabase(handle, { migrationsRoot, backupsDir: dir });
    return {
      handle,
      cleanup: async () => {
        await handle.close();
        fs.rmSync(dir, { recursive: true, force: true });
      },
    };
  }
  const handle = openDatabase(parsed, { readOnly: true, poolMax: 2 });
  return { handle, cleanup: () => handle.close() };
}

/** An unmigrated target (no tables yet, e.g. in a dry run) counts as empty. */
async function targetHasData(h: DbHandle) {
  let counts;
  try {
    counts = await countRows(h);
  } catch {
    return false;
  }
  return hasData(counts);
}

export type ImportResult = CopyReport & { logFile: string | null; renamedSource: string | null };

export async function importLibrary(opts: {
  sourceUrl: string;
  target: DbHandle;
  migrationsRoot: string;
  backupsDir: string | null;
  /** Rename the default SQLite file afterwards so the import isn't offered again. */
  renameSourceAfter?: boolean;
  dryRun?: boolean;
  log?: (line: string) => void;
}): Promise<{ info: SourceInfo; result: ImportResult | null }> {
  const log = opts.log ?? (() => {});
  const info = await inspectSource(opts.sourceUrl, opts.target, opts.migrationsRoot);
  log(
    `Source: ${info.redacted} (${info.dialect}, schema ${info.sourceVersion}/${info.targetVersion})`,
  );
  log(`Found: ${describeCounts(info.counts)}`);
  if (await targetHasData(opts.target)) {
    throw new CopyError(
      "The target database is not empty (it has users or catalog data). Refusing to copy.",
    );
  }
  if (opts.dryRun) {
    if (info.compatibility === "newer" || info.compatibility === "older-pg") {
      throw new CopyError(`Schema versions are incompatible (${info.compatibility}).`);
    }
    return { info, result: null };
  }
  const { handle, cleanup } = await openSource(info, opts.migrationsRoot);
  const lines: string[] = [
    `33rpm library import ${new Date().toISOString()}`,
    `source: ${info.redacted}`,
  ];
  let report: CopyReport;
  try {
    report = await copyInto(
      databaseSource(handle, info.dialect === "pg" ? "PostgreSQL" : "SQLite"),
      opts.target,
      {
        onTable: (name, n) => {
          lines.push(`${name}: ${n}`);
          log(`  ${name}: ${n}`);
        },
      },
    );
  } finally {
    await cleanup();
  }
  lines.push(`duration: ${report.durationMs} ms`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let logFile: string | null = null;
  if (opts.backupsDir) {
    fs.mkdirSync(opts.backupsDir, { recursive: true });
    logFile = path.join(opts.backupsDir, `migration-${stamp}.log`);
    fs.writeFileSync(logFile, lines.join("\n") + "\n");
  }
  let renamedSource: string | null = null;
  const parsed = parseDatabaseUrl(opts.sourceUrl);
  if (opts.renameSourceAfter && parsed.dialect === "sqlite") {
    renamedSource = `${parsed.path}.migrated-${stamp}`;
    fs.renameSync(parsed.path, renamedSource);
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(parsed.path + suffix))
        fs.renameSync(parsed.path + suffix, renamedSource + suffix);
    }
  }
  return { info, result: { ...report, logFile, renamedSource } };
}
