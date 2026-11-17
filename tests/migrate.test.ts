import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { pendingMigrations, runMigrations, snapshotDatabase } from "@/db/migrate";
import { openSqlite } from "@/db/sqlite";
import { MIGRATIONS, tmpDir } from "./helpers";

/** Copy the real migrations and append a synthetic one, as a future release would. */
function migrationsWithExtra(): string {
  const dir = path.join(tmpDir(), "drizzle");
  fs.cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  const last = journal.entries.at(-1);
  journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag: "9999_test" });
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  fs.writeFileSync(
    path.join(dir, "9999_test.sql"),
    "CREATE TABLE `probe` (`id` text PRIMARY KEY);",
  );
  return dir;
}

describe("runMigrations", () => {
  it("migrates a fresh database without taking a snapshot", () => {
    const dir = tmpDir();
    const sqlite = openSqlite(path.join(dir, "33rpm.db"));
    const backups = path.join(dir, "backups");
    const result = runMigrations({ sqlite, migrationsFolder: MIGRATIONS, backupsDir: backups });
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.snapshot).toBeNull();
    expect(pendingMigrations(sqlite, MIGRATIONS)).toEqual([]);
    // Idempotent on the next boot.
    expect(runMigrations({ sqlite, migrationsFolder: MIGRATIONS, backupsDir: backups })).toEqual({
      applied: [],
      snapshot: null,
    });
  });

  it("snapshots an existing database before applying new migrations", () => {
    const dir = tmpDir();
    const sqlite = openSqlite(path.join(dir, "33rpm.db"));
    const backups = path.join(dir, "backups");
    runMigrations({ sqlite, migrationsFolder: MIGRATIONS, backupsDir: backups });
    sqlite.prepare("INSERT INTO user (id, name, email) VALUES ('u1', 'A', 'a@example.com')").run();

    const result = runMigrations({
      sqlite,
      migrationsFolder: migrationsWithExtra(),
      backupsDir: backups,
    });
    expect(result.applied).toEqual(["9999_test"]);
    expect(result.snapshot).toMatch(/33rpm-pre-migrate-.*\.db$/);

    // The snapshot is a consistent copy of the pre-migration state.
    const snap = openSqlite(result.snapshot!);
    expect(snap.prepare("SELECT COUNT(*) AS n FROM user").get()).toEqual({ n: 1 });
    expect(
      snap.prepare("SELECT name FROM sqlite_master WHERE name = 'probe'").get(),
    ).toBeUndefined();
  });

  it("keeps only the five most recent pre-migration snapshots", () => {
    const dir = tmpDir();
    const sqlite = openSqlite(path.join(dir, "33rpm.db"));
    const backups = path.join(dir, "backups");
    fs.mkdirSync(backups);
    fs.writeFileSync(path.join(backups, "unrelated.db"), "");
    for (let i = 0; i < 7; i++) {
      snapshotDatabase(sqlite, backups, new Date(Date.UTC(2026, 0, 1, 0, 0, i)));
    }
    const files = fs.readdirSync(backups).sort();
    expect(files.filter((f) => f.startsWith("33rpm-pre-migrate-"))).toHaveLength(5);
    expect(files).toContain("unrelated.db");
  });
});
