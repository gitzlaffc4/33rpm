import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase, type DbHandle } from "@/db/client";
import { copyInto, CopyError, countRows, databaseSource } from "@/db/copy";
import { exportJson, jsonSource } from "@/db/copy/json";
import { importLibrary, inspectSource } from "@/db/copy/library-import";
import { migrateDatabase, schemaVersion } from "@/db/migrate";
import { addCopyPhoto, createCopy, createManualRelease, ensureLocation } from "@/db/repos/catalog";
import { createUserWithPassword } from "@/db/repos/users";
import { addToWishlist } from "@/db/repos/wishlist";
import { newId } from "@/db/ids";
import { withTransaction } from "@/db/tx";
import { MIGRATIONS_ROOT, TEST_DIALECT, migratedDb, tmpDir, type TestDb } from "./db";

/** A populated SQLite library on disk (the usual "old" database). */
async function sqliteLibrary(dir: string, migrationsRoot = MIGRATIONS_ROOT) {
  const file = path.join(dir, "33rpm.db");
  const h = openDatabase({ dialect: "sqlite", url: `file:${file}`, path: file });
  await migrateDatabase(h, { migrationsRoot, backupsDir: path.join(dir, "backups") });
  return { h, file, url: `file:${file}` };
}

async function populate(h: DbHandle) {
  const userId = await withTransaction(
    (tx) =>
      createUserWithPassword(tx, h.t, { name: "A", email: "a@example.com", passwordHash: "x" }),
    h,
  );
  const shelf = await ensureLocation(userId, "Shelf", h);
  for (let i = 0; i < 30; i++) {
    const { releaseId, masterId } = await createManualRelease(
      userId,
      {
        artist: `Artist ${i % 7}`,
        title: `Album ${i}`,
        year: 1970 + i,
        format: i % 2 ? "vinyl" : "cd",
        formatDetails: ["LP"],
        label: "L",
        catalogNumber: `CAT-${i}`,
        country: "US",
        barcode: String(100000000000 + i),
        tracklist: [{ position: "A1", title: "Song", duration: "3:00" }],
        notes: null,
      },
      null,
      h,
    );
    const copyId = await createCopy(
      userId,
      releaseId,
      {
        mediaCondition: "VG+",
        sleeveCondition: null,
        priceMinor: 1000 + i,
        currency: "USD",
        acquiredOn: "2024-01-02",
        source: null,
        locationId: shelf,
        notes: null,
        rating: 4,
        tags: ["a", `t${i % 3}`],
      },
      h,
    );
    if (i === 0) {
      await addCopyPhoto(
        userId,
        copyId,
        {
          id: newId(),
          kind: "photo",
          path: "photos/x/y",
          width: 1,
          height: 1,
          sha256: null,
          sourceUrl: null,
          userId,
        },
        h,
      );
    }
    if (i % 5 === 0) await addToWishlist(userId, { masterId }, { priority: 1, tags: ["want"] }, h);
  }
  return userId;
}

let target: TestDb;
let dir: string;
beforeEach(async () => {
  target = await migratedDb();
  dir = tmpDir();
});
afterEach(async () => {
  await target.cleanup();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe(`copy engine: SQLite → ${TEST_DIALECT}`, () => {
  it("copies every table with ids, dates and JSON intact, and verifies counts", async () => {
    const src = await sqliteLibrary(dir);
    await populate(src.h);
    const before = await countRows(src.h);
    const report = await copyInto(databaseSource(src.h), target, { batchSize: 7 });
    expect(report.counts.copy).toBe(30);
    const after = await countRows(target);
    for (const [t, n] of Object.entries(before))
      if (t !== "app_state") expect(after[t as keyof typeof after]).toBe(n);

    const [a] = await src.h.db.select().from(src.h.t.release).limit(1);
    const [b] = await target.db
      .select()
      .from(target.t.release)
      .where((await import("drizzle-orm")).eq(target.t.release.id, a.id));
    expect(b).toEqual(a);
    await src.h.close();
  });

  it("refuses a target that already has data", async () => {
    const src = await sqliteLibrary(dir);
    await populate(src.h);
    await populate(target);
    await expect(copyInto(databaseSource(src.h), target)).rejects.toBeInstanceOf(CopyError);
    await src.h.close();
  });

  it("round-trips through a JSON backup", async () => {
    const src = await sqliteLibrary(dir);
    await populate(src.h);
    let json = "";
    for await (const chunk of exportJson(src.h)) json += chunk;
    const report = await copyInto(jsonSource(JSON.parse(json)), target);
    expect(report.counts.wishlist_item).toBe(6);
    const [c] = await target.db.select().from(target.t.copy).limit(1);
    expect(c.createdAt).toBeInstanceOf(Date);
    expect(await countRows(target)).toMatchObject({ copy: 30, copy_photo: 1, wishlist_tag: 6 });
    await src.h.close();
  });

  it("imports an older SQLite library via a migrated temp copy and renames the original", async () => {
    // Build a source that only has the first two migrations.
    const oldRoot = path.join(dir, "old-migrations");
    fs.cpSync(MIGRATIONS_ROOT, oldRoot, { recursive: true });
    const journalFile = path.join(oldRoot, "sqlite", "meta", "_journal.json");
    const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
    journal.entries = journal.entries.slice(0, 2);
    fs.writeFileSync(journalFile, JSON.stringify(journal));
    const src = await sqliteLibrary(dir, oldRoot);
    const userId = await withTransaction(
      (tx) =>
        createUserWithPassword(tx, src.h.t, {
          name: "A",
          email: "a@example.com",
          passwordHash: "x",
        }),
      src.h,
    );
    expect(userId).toBeTruthy();
    expect((await schemaVersion(src.h, MIGRATIONS_ROOT)).applied).toBe(2);
    await src.h.close();

    const info = await inspectSource(src.url, target, MIGRATIONS_ROOT);
    expect(info.compatibility).toBe("older-sqlite");
    expect(info.counts.user).toBe(1);

    const dry = await importLibrary({
      sourceUrl: src.url,
      target,
      migrationsRoot: MIGRATIONS_ROOT,
      backupsDir: null,
      dryRun: true,
    });
    expect(dry.result).toBeNull();

    const backups = path.join(dir, "backups-out");
    const { result } = await importLibrary({
      sourceUrl: src.url,
      target,
      migrationsRoot: MIGRATIONS_ROOT,
      backupsDir: backups,
      renameSourceAfter: true,
    });
    expect((await countRows(target)).user).toBe(1);
    expect(result?.logFile && fs.readFileSync(result.logFile, "utf8")).toContain("user: 1");
    expect(fs.existsSync(src.file)).toBe(false);
    // The original was never migrated in place.
    const renamed = openDatabase({
      dialect: "sqlite",
      url: `file:${result!.renamedSource}`,
      path: result!.renamedSource!,
    });
    expect((await schemaVersion(renamed, MIGRATIONS_ROOT)).applied).toBe(2);
    await renamed.close();
  });
});
