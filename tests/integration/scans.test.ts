import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createManualRelease, findReleasesByBarcode } from "@/db/repos/catalog";
import {
  dismissScans,
  enqueueScan,
  getScan,
  listOpenScans,
  listPendingScans,
  setScanResult,
} from "@/db/repos/scans";
import { createUserWithPassword } from "@/db/repos/users";
import { withTransaction } from "@/db/tx";
import { TEST_DIALECT, migratedDb, type TestDb } from "./db";

let db: TestDb;
let userId: string;
beforeEach(async () => {
  db = await migratedDb();
  userId = await withTransaction(
    (tx) =>
      createUserWithPassword(tx, db.t, { name: "A", email: "a@example.com", passwordHash: "x" }),
    db,
  );
});
afterEach(async () => {
  await db.cleanup();
});

describe(`scan queue (${TEST_DIALECT})`, () => {
  it("queues, resolves and dismisses scans", async () => {
    const a = await enqueueScan(userId, "0 75992-73132 4", db);
    const b = await enqueueScan(userId, "5099902894225", db);
    await expect(enqueueScan(userId, "12", db)).rejects.toThrow();

    expect((await getScan(a, db))?.barcode).toBe("075992731324");
    expect((await listPendingScans(db)).map((s) => s.id).sort()).toEqual([a, b].sort());

    await setScanResult(a, { status: "ambiguous", candidates: [] }, db);
    await setScanResult(b, { status: "added" }, db);
    expect((await listOpenScans(userId, db)).map((s) => [s.id, s.status])).toEqual([
      [a, "ambiguous"],
    ]);

    await dismissScans("someone-else", [a], db);
    expect(await listOpenScans(userId, db)).toHaveLength(1);
    await dismissScans(userId, [a], db);
    expect(await listOpenScans(userId, db)).toHaveLength(0);
  });

  it("finds local releases by either UPC-A or EAN-13 spelling", async () => {
    const { releaseId } = await createManualRelease(
      userId,
      {
        artist: "X",
        title: "Y",
        year: null,
        format: "cd",
        formatDetails: [],
        label: null,
        catalogNumber: null,
        country: null,
        barcode: "075992731324",
        tracklist: [],
        notes: null,
      },
      null,
      db,
    );
    expect(await findReleasesByBarcode("0075992731324", db)).toEqual([releaseId]);
    expect(await findReleasesByBarcode("075992731324", db)).toEqual([releaseId]);
  });
});
