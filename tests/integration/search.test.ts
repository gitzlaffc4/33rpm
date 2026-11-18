import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createManualRelease } from "@/db/repos/catalog";
import { createUserWithPassword } from "@/db/repos/users";
import { getSearchIndex, queryTokens } from "@/db/search";
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

async function add(
  artist: string,
  title: string,
  extra: { catno?: string; barcode?: string; label?: string } = {},
) {
  const { releaseId } = await createManualRelease(
    userId,
    {
      artist,
      title,
      year: 1977,
      format: "vinyl",
      formatDetails: ["LP"],
      label: extra.label ?? null,
      catalogNumber: extra.catno ?? null,
      country: "US",
      barcode: extra.barcode ?? null,
      tracklist: [],
      notes: null,
    },
    null,
    db,
  );
  return releaseId;
}

describe(`SearchIndex (${TEST_DIALECT})`, () => {
  it("finds releases by prefix, artist, catalog number, barcode and folded diacritics", async () => {
    const rumours = await add("Fleetwood Mac", "Rumours", {
      catno: "BSK 3010",
      barcode: "075992731324",
      label: "Warner Bros.",
    });
    const homogenic = await add("Björk", "Homogenic", { label: "One Little Indian" });
    await add("Fleetwood Mac", "Tusk");
    const index = getSearchIndex(db);

    const ids = async (q: string) => (await index.search(q)).map((h) => h.releaseId);
    expect(await ids("flee rum")).toEqual([rumours]);
    expect((await ids("fleetwood")).length).toBe(2);
    expect(await ids("bsk3010")).toEqual([rumours]);
    expect(await ids("BSK 3010")).toEqual([rumours]);
    expect(await ids("0759927")).toEqual([rumours]);
    expect(await ids("bjork")).toEqual([homogenic]);
    expect(await ids("Björk")).toEqual([homogenic]);
    expect(await ids("little indian")).toEqual([homogenic]);
    expect(await ids("nothing like this")).toEqual([]);
    expect(await ids("  ")).toEqual([]);

    expect(await index.count()).toBe(3);
    expect(await index.rebuild()).toBe(3);
    expect(await ids("tusk")).toHaveLength(1);
  });

  it("handles hostile input safely", async () => {
    await add("AC/DC", "Back in Black");
    const index = getSearchIndex(db);
    for (const q of ['"', "'; DROP TABLE release; --", "NEAR(", "a* OR b", "%_\\", "ac/dc"]) {
      await expect(index.search(q)).resolves.toBeInstanceOf(Array);
    }
    expect((await index.search("ac dc")).length).toBe(1);
    expect(queryTokens("Ac/Dc ac dc")).toEqual(["ac", "dc"]);
  });
});
