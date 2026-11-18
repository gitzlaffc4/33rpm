import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCopy, createManualRelease, type CopyInput } from "@/db/repos/catalog";
import { createUserWithPassword } from "@/db/repos/users";
import {
  addToWishlist,
  deleteWishlistItem,
  getWishlistItem,
  listWishlist,
  markAcquired,
  ownedCounts,
  updateWishlistItem,
  wishlistFor,
} from "@/db/repos/wishlist";
import { withTransaction } from "@/db/tx";
import { TEST_DIALECT, migratedDb, type TestDb } from "./db";

const blank: CopyInput = {
  mediaCondition: null,
  sleeveCondition: null,
  priceMinor: null,
  currency: null,
  acquiredOn: null,
  source: null,
  locationId: null,
  notes: null,
  rating: null,
  tags: [],
};

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

async function release(artist: string, title: string, format: "vinyl" | "cd", barcode?: string) {
  return createManualRelease(
    userId,
    {
      artist,
      title,
      year: 1990,
      format,
      formatDetails: [],
      label: "L",
      catalogNumber: null,
      country: null,
      barcode: barcode ?? null,
      tracklist: [],
      notes: null,
    },
    null,
    db,
  );
}

describe(`wishlist (${TEST_DIALECT})`, () => {
  it("adds master and release targets, dedupes open items, sorts and updates", async () => {
    const a = await release("Zebra", "Alpha", "vinyl");
    const b = await release("Aardvark", "Beta", "cd");
    const wa = await addToWishlist(userId, { masterId: a.masterId }, { priority: 3 }, db);
    expect(wa.created).toBe(true);
    expect((await addToWishlist(userId, { masterId: a.masterId }, {}, db)).id).toBe(wa.id);
    const wb = await addToWishlist(
      userId,
      { releaseId: b.releaseId },
      { priority: 1, tags: ["Want"] },
      db,
    );

    const byPriority = await listWishlist(userId, {}, db);
    expect(byPriority.map((i) => i.title)).toEqual(["Beta", "Alpha"]);
    expect(byPriority[0]).toMatchObject({
      target: "release",
      format: "cd",
      artist: "Aardvark",
      tags: ["Want"],
    });
    expect(byPriority[1]).toMatchObject({ target: "master", format: null });
    expect((await listWishlist(userId, { sort: "artist" }, db)).map((i) => i.artist)).toEqual([
      "Aardvark",
      "Zebra",
    ]);

    expect(
      await updateWishlistItem(
        userId,
        wa.id,
        {
          priority: 1,
          maxPriceMinor: 2500,
          currency: "USD",
          notes: "n",
          status: "ordered",
          tags: [],
        },
        db,
      ),
    ).toBe(true);
    expect(await getWishlistItem(userId, wa.id, db)).toMatchObject({
      status: "ordered",
      maxPriceMinor: 2500,
    });

    await deleteWishlistItem(userId, wb.id, db);
    expect(await listWishlist(userId, {}, db)).toHaveLength(1);
  });

  it("Got it: links the copy and moves the item to acquired", async () => {
    const a = await release("X", "Y", "vinyl");
    const w = await addToWishlist(userId, { masterId: a.masterId }, {}, db);
    const copyId = await createCopy(userId, a.releaseId, blank, db);
    await markAcquired(userId, w.id, copyId, db);
    expect(await listWishlist(userId, {}, db)).toEqual([]);
    expect((await listWishlist(userId, { status: "acquired" }, db))[0]).toMatchObject({
      acquiredCopyId: copyId,
    });
    // Acquired items don't block wanting it again.
    expect((await addToWishlist(userId, { masterId: a.masterId }, {}, db)).created).toBe(true);
  });

  it("reports wishlist and ownership for in-store checks", async () => {
    const a = await release("X", "Y", "vinyl");
    const b = await release("X", "Y", "cd");
    expect(b.masterId).toBe(a.masterId);
    await createCopy(userId, a.releaseId, blank, db);
    await addToWishlist(userId, { releaseId: b.releaseId }, {}, db);
    const owned = await ownedCounts(
      userId,
      { masterIds: [a.masterId], releaseIds: [b.releaseId] },
      db,
    );
    expect(owned.masters.get(a.masterId)).toBe(1);
    expect(owned.releases.get(b.releaseId)).toBeUndefined();
    const wishes = await wishlistFor(userId, { releaseIds: [b.releaseId] }, db);
    expect(wishes.map((w) => w.releaseId)).toEqual([b.releaseId]);
  });
});

describe(`in-store check (${TEST_DIALECT})`, () => {
  it("says owned / wanted / other edition / new for catalog barcodes", async () => {
    const { setDb } = await import("@/db");
    const { checkBarcode } = await import("@/lib/catalog/check");
    setDb(db);
    const lp = await release("X", "Y", "vinyl", "012345678905");
    const cd = await release("X", "Y", "cd", "036000291452");
    const other = await release("Q", "R", "cd", "5099902894225");

    expect((await checkBarcode(userId, "0012345678905")).verdict).toBe("new");
    await createCopy(userId, lp.releaseId, blank, db);
    expect(await checkBarcode(userId, "012345678905")).toMatchObject({
      verdict: "owned",
      copies: 1,
    });
    expect((await checkBarcode(userId, "036000291452")).verdict).toBe("owned-other-edition");
    await addToWishlist(userId, { releaseId: cd.releaseId }, {}, db);
    expect((await checkBarcode(userId, "036000291452")).verdict).toBe("wanted");
    await addToWishlist(userId, { masterId: other.masterId }, {}, db);
    expect(await checkBarcode(userId, "5099902894225")).toMatchObject({
      verdict: "wanted",
      wish: { target: "master" },
    });
    setDb(undefined);
  });
});
