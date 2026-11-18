import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openSqlite } from "@/db/client";
import {
  migrateDatabase,
  pendingMigrations,
  pendingPgMigrations,
  runMigrations,
  snapshotDatabase,
} from "@/db/migrate";
import { MIGRATIONS_ROOT, TEST_DIALECT, emptyDb, migratedDb, tmpDir, type TestDb } from "./db";

let db: TestDb | undefined;
afterEach(async () => {
  await db?.cleanup();
  db = undefined;
});

const folder = (dialect = TEST_DIALECT) => path.join(MIGRATIONS_ROOT, dialect);

/** Copy the real migrations and append a synthetic one, as a future release would. */
function migrationsWithExtra(dialect = TEST_DIALECT): string {
  const dir = path.join(tmpDir(), dialect);
  fs.cpSync(folder(dialect), dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const last = journal.entries.at(-1);
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag: "9999_test" });
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  const ddl =
    dialect === "pg"
      ? 'CREATE TABLE "probe" ("id" text PRIMARY KEY);'
      : "CREATE TABLE `probe` (`id` text PRIMARY KEY);";
  fs.writeFileSync(path.join(dir, "9999_test.sql"), ddl);
  return path.dirname(dir);
}

describe(`migrateDatabase (${TEST_DIALECT})`, () => {
  it("migrates a fresh database and is idempotent", async () => {
    db = await emptyDb();
    const opts = { migrationsRoot: MIGRATIONS_ROOT, backupsDir: path.join(db.dir, "backups") };
    const first = await migrateDatabase(db, opts);
    expect(first.applied).toContain("0000_init");
    expect(first.snapshot).toBeNull();
    expect(await migrateDatabase(db, opts)).toEqual({ applied: [], snapshot: null });
  });

  it("applies a newly added migration", async () => {
    db = await emptyDb();
    const backupsDir = path.join(db.dir, "backups");
    await migrateDatabase(db, { migrationsRoot: MIGRATIONS_ROOT, backupsDir });
    const result = await migrateDatabase(db, { migrationsRoot: migrationsWithExtra(), backupsDir });
    expect(result.applied).toEqual(["9999_test"]);
    if (TEST_DIALECT === "pg") {
      expect(result.snapshot).toBeNull(); // pg_dump is the documented path
      expect(await pendingPgMigrations(db.pool!, path.join(migrationsWithExtra(), "pg"))).toEqual(
        [],
      );
    } else {
      expect(result.snapshot).toMatch(/33rpm-pre-migrate-.*\.db$/);
    }
  });

  it.runIf(TEST_DIALECT === "pg")(
    "serializes concurrent migrators with the advisory lock",
    async () => {
      db = await emptyDb();
      const opts = { migrationsRoot: MIGRATIONS_ROOT, backupsDir: path.join(db.dir, "backups") };
      const results = await Promise.all([1, 2, 3].map(() => migrateDatabase(db!, opts)));
      // Exactly one replica applied the migrations; the others found nothing pending.
      expect(results.filter((r) => r.applied.length > 0)).toHaveLength(1);
    },
  );
});

describe.runIf(TEST_DIALECT === "sqlite")("SQLite snapshots", () => {
  it("snapshots the pre-migration state", async () => {
    db = await emptyDb();
    const backupsDir = path.join(db.dir, "backups");
    await migrateDatabase(db, { migrationsRoot: MIGRATIONS_ROOT, backupsDir });
    db.sqlite!.prepare(
      "INSERT INTO user (id, name, email) VALUES ('u1', 'A', 'a@example.com')",
    ).run();
    const result = runMigrations({
      sqlite: db.sqlite!,
      migrationsFolder: path.join(migrationsWithExtra("sqlite"), "sqlite"),
      backupsDir,
    });
    const snap = openSqlite(result.snapshot!);
    expect(snap.prepare("SELECT COUNT(*) AS n FROM user").get()).toEqual({ n: 1 });
    expect(
      snap.prepare("SELECT name FROM sqlite_master WHERE name = 'probe'").get(),
    ).toBeUndefined();
    expect(pendingMigrations(db.sqlite!, folder("sqlite"))).toEqual([]);
  });

  it("keeps only the five most recent pre-migration snapshots", () => {
    const dir = tmpDir();
    const sqlite = openSqlite(path.join(dir, "33rpm.db"));
    const backups = path.join(dir, "backups");
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, "unrelated.db"), "");
    for (let i = 0; i < 7; i++)
      snapshotDatabase(sqlite, backups, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    const files = fs.readdirSync(backups);
    expect(files.filter((f) => f.startsWith("33rpm-pre-migrate-"))).toHaveLength(5);
    expect(files).toContain("unrelated.db");
  });
});

describe("automatic backups", () => {
  it("snapshots on schedule and keeps the newest N", async () => {
    if (TEST_DIALECT !== "sqlite") return;
    const { maybeSnapshot, AUTO_PREFIX } = await import("@/server/backups");
    const db = await migratedDb();
    const backupsDir = path.join(db.dir, "auto");
    const opts = { backupsDir, intervalHours: 24, keep: 2 };
    const day = 86_400_000;
    const t0 = Date.UTC(2026, 0, 1);
    const files: string[] = [];
    for (let i = 0; i < 4; i++) {
      const f = maybeSnapshot(db, opts, t0 + i * day);
      expect(f).toBeTruthy();
      fs.utimesSync(f!, (t0 + i * day) / 1000, (t0 + i * day) / 1000);
      files.push(f!);
      expect(maybeSnapshot(db, opts, t0 + i * day + 3_600_000)).toBeNull();
    }
    const kept = fs.readdirSync(backupsDir).filter((f) => f.startsWith(AUTO_PREFIX));
    expect(kept).toHaveLength(2);
    expect(maybeSnapshot(db, { ...opts, intervalHours: 0 }, t0 + 99 * day)).toBeNull();
    await db.cleanup();
  });
});
