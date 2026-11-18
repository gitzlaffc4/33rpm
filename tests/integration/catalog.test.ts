import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addCopyPhoto,
  createCopy,
  createManualRelease,
  deleteCopy,
  ensureLocation,
  findReleaseByProviderId,
  findReleasesByBarcode,
  formatCounts,
  getCopy,
  getMasterPage,
  importRelease,
  listAlbums,
  listArtists,
  listLocations,
  listRecentCopies,
  ownershipFor,
  updateCopy,
  type CopyInput,
} from "@/db/repos/catalog";
import { getCached, putCached } from "@/db/repos/provider-cache";
import { createUserWithPassword } from "@/db/repos/users";
import { newId } from "@/db/ids";
import { withTransaction } from "@/db/tx";
import { mapDiscogsRelease } from "@/lib/providers/discogs";
import { mapMbRelease } from "@/lib/providers/musicbrainz";
import type { MasterDetail } from "@/lib/providers/types";
import { TEST_DIALECT, migratedDb, type TestDb } from "./db";

const fixture = (name: string) =>
  JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "../fixtures/providers", name), "utf8"),
  );

const dsotm = () => {
  const m = fixture("discogs-master.json");
  const master: MasterDetail = {
    provider: "discogs",
    providerId: String(m.id),
    title: m.title,
    year: m.year,
    artists: m.artists.map((a: { id: number; name: string }) => ({
      name: a.name,
      providerId: String(a.id),
      joinPhrase: "",
    })),
    genres: m.genres,
    styles: m.styles,
  };
  return mapDiscogsRelease(fixture("discogs-release.json"), master);
};
const rumours = () => mapMbRelease(fixture("mb-release.json"));

const blankCopy: CopyInput = {
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

describe(`catalog repo (${TEST_DIALECT})`, () => {
  it("imports a provider release with master, artists and barcodes, idempotently", async () => {
    const first = await importRelease(dsotm(), null, db);
    expect(first.created).toBe(true);
    const again = await importRelease(dsotm(), null, db);
    expect(again).toEqual({ ...first, created: false });
    expect(await findReleaseByProviderId("discogs", "1873013", db)).toBe(first.releaseId);

    const page = await getMasterPage(userId, first.masterId, db);
    expect(page?.master.title).toBe("The Dark Side Of The Moon");
    expect(page?.master.artist).toBe("Pink Floyd");
    expect(page?.releases).toHaveLength(1);
    expect(page?.releases[0].tracklist.length).toBeGreaterThan(5);
    expect(page?.master.genres).toContain("Rock");
  });

  it("merges the same album from two providers into one master", async () => {
    const mb = rumours();
    const a = await importRelease(mb, null, db);
    const manual = await createManualRelease(
      userId,
      {
        artist: "fleetwood mac",
        title: "Rumours",
        year: 1977,
        format: "cassette",
        formatDetails: ["Album"],
        label: null,
        catalogNumber: "M5 3010",
        country: "US",
        barcode: "0 7599-27313-2 4",
        tracklist: [],
        notes: null,
      },
      null,
      db,
    );
    expect(manual.masterId).toBe(a.masterId);
    expect(await findReleasesByBarcode("075992731324", db)).toContain(manual.releaseId);
  });

  it("creates, edits and deletes copies with tags and locations", async () => {
    const { releaseId, masterId } = await importRelease(dsotm(), null, db);
    const shelf = await ensureLocation(userId, "Shelf A", db);
    expect(await ensureLocation(userId, "Shelf A", db)).toBe(shelf);

    const c1 = await createCopy(
      userId,
      releaseId,
      {
        ...blankCopy,
        mediaCondition: "VG+",
        priceMinor: 2499,
        currency: "USD",
        locationId: shelf,
        tags: ["Gift", "gift", "OG"],
      },
      db,
    );
    const c2 = await createCopy(userId, releaseId, blankCopy, db);

    const copy = await getCopy(userId, c1, db);
    expect(copy?.priceMinor).toBe(2499);
    expect(copy?.tags).toEqual(["Gift", "OG"]);
    expect(copy?.release.artist).toBe("Pink Floyd");

    expect(
      await updateCopy(userId, c1, { ...blankCopy, sleeveCondition: "NM", tags: ["OG"] }, db),
    ).toBe(true);
    expect((await getCopy(userId, c1, db))?.tags).toEqual(["OG"]);
    expect(await updateCopy("someone-else", c1, blankCopy, db)).toBe(false);

    const albums = await listAlbums(userId, {}, db);
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      masterId,
      copies: 2,
      formats: ["vinyl"],
      artist: "Pink Floyd",
    });
    expect(albums[0].lastAdded).toBeInstanceOf(Date);

    expect((await listLocations(userId, db))[0]).toMatchObject({ name: "Shelf A", copies: 0 });
    expect(await formatCounts(userId, db)).toEqual([{ format: "vinyl", copies: 2 }]);
    expect((await listArtists(userId, db))[0]).toMatchObject({
      name: "Pink Floyd",
      albums: 1,
      copies: 2,
    });
    expect((await listRecentCopies(userId, 10, db)).map((r) => r.copyId)).toEqual([c2, c1]);

    const deleted = await deleteCopy(userId, c2, db);
    expect(deleted?.masterId).toBe(masterId);
    expect(await getCopy(userId, c2, db)).toBeNull();
  });

  it("filters the library by text, format and location", async () => {
    const a = await importRelease(dsotm(), null, db);
    const b = await importRelease(rumours(), null, db);
    const crate = await ensureLocation(userId, "Crate", db);
    await createCopy(userId, a.releaseId, { ...blankCopy, locationId: crate }, db);
    await createCopy(userId, b.releaseId, blankCopy, db);

    expect((await listAlbums(userId, { q: "dark side" }, db)).map((x) => x.title)).toEqual([
      "The Dark Side Of The Moon",
    ]);
    expect((await listAlbums(userId, { q: "FLEETWOOD" }, db)).map((x) => x.title)).toEqual([
      "Rumours",
    ]);
    expect(await listAlbums(userId, { q: "100%_" }, db)).toEqual([]);
    expect((await listAlbums(userId, { locationId: crate }, db)).map((x) => x.masterId)).toEqual([
      a.masterId,
    ]);
    expect((await listAlbums(userId, { sort: "artist" }, db)).map((x) => x.artist)).toEqual([
      "Fleetwood Mac",
      "Pink Floyd",
    ]);
  });

  it("reports which search results are already owned", async () => {
    const { releaseId } = await importRelease(dsotm(), null, db);
    await createCopy(userId, releaseId, blankCopy, db);
    const own = await ownershipFor(userId, "discogs", ["1873013", "999"], ["10362"], db);
    expect(own.releases.get("1873013")).toBe(1);
    expect(own.releases.has("999")).toBe(false);
    expect(own.masters.has("10362")).toBe(true);
  });

  it("attaches photos to a copy and removes them with it", async () => {
    const { releaseId } = await importRelease(dsotm(), null, db);
    const copyId = await createCopy(userId, releaseId, blankCopy, db);
    const img = {
      id: newId(),
      kind: "photo" as const,
      path: "photos/xx/p",
      width: 10,
      height: 10,
      sha256: null,
      sourceUrl: null,
      userId,
    };
    expect(await addCopyPhoto(userId, copyId, img, db)).toBe(true);
    expect((await getCopy(userId, copyId, db))?.photoIds).toEqual([img.id]);
    const res = await deleteCopy(userId, copyId, db);
    expect(res?.photos.map((p) => p.path)).toEqual(["photos/xx/p"]);
  });

  it("caches provider payloads with a max age", async () => {
    await putCached("musicbrainz", "k", { a: 1 }, db);
    expect(await getCached("musicbrainz", "k", 60_000, db)).toEqual({ a: 1 });
    await putCached("musicbrainz", "k", { a: 2 }, db);
    expect(await getCached("musicbrainz", "k", 60_000, db)).toEqual({ a: 2 });
    expect(await getCached("musicbrainz", "k", -1, db)).toBeNull();
  });
});
