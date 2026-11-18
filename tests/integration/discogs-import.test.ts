import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setDb } from "@/db";
import { countRows } from "@/db/copy";
import { listLocations } from "@/db/repos/catalog";
import { createUserWithPassword } from "@/db/repos/users";
import { listWishlist } from "@/db/repos/wishlist";
import { withTransaction } from "@/db/tx";
import { resetEnvCache } from "@/env";
import { runDiscogsImport } from "@/lib/integrations/discogs-import";
import { TEST_DIALECT, migratedDb, type TestDb } from "./db";

const basic = (id: number, title: string, artist: string, master: number) => ({
  id,
  master_id: master,
  title,
  year: 1977,
  cover_image: null,
  formats: [{ name: "Vinyl", qty: "1", descriptions: ["LP", "Album"] }],
  labels: [{ name: "Warner Bros. Records", catno: `BSK ${id}` }],
  artists: [{ id: master * 10, name: artist, anv: "", join: "" }],
  genres: ["Rock"],
  styles: [],
});

/** A tiny fake Discogs API: 3 collection items over 2 pages, 1 want. */
function fakeDiscogs(state: { mediaCondition: string }) {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json", "x-discogs-ratelimit-remaining": "50" },
      });
    const p = url.pathname;
    if (p === "/oauth/identity") return json({ username: "tester" });
    if (p.endsWith("/collection/folders"))
      return json({
        folders: [
          { id: 0, name: "All" },
          { id: 1, name: "Uncategorized" },
          { id: 7, name: "Shelf A" },
        ],
      });
    if (p.endsWith("/collection/fields"))
      return json({
        fields: [
          { id: 1, name: "Media Condition" },
          { id: 2, name: "Sleeve Condition" },
          { id: 3, name: "Notes" },
        ],
      });
    if (p.endsWith("/collection/folders/0/releases")) {
      const page = Number(url.searchParams.get("page"));
      const items = [
        {
          id: 101,
          instance_id: 9001,
          folder_id: 7,
          rating: 4,
          date_added: "2020-01-02T00:00:00-08:00",
          notes: [
            { field_id: 1, value: state.mediaCondition },
            { field_id: 3, value: "signed" },
          ],
          basic_information: basic(101, "Rumours", "Fleetwood Mac", 1),
        },
        {
          id: 101,
          instance_id: 9002,
          folder_id: 1,
          rating: 0,
          date_added: null,
          notes: [],
          basic_information: basic(101, "Rumours", "Fleetwood Mac", 1),
        },
        {
          id: 202,
          instance_id: 9003,
          folder_id: 7,
          rating: 0,
          date_added: null,
          notes: [{ field_id: 2, value: "Very Good (VG)" }],
          basic_information: basic(202, "Tusk", "Fleetwood Mac", 2),
        },
      ];
      return json({
        pagination: { page, pages: 2, items: 3 },
        releases: page === 1 ? items.slice(0, 2) : items.slice(2),
      });
    }
    if (p.endsWith("/wants"))
      return json({
        pagination: { page: 1, pages: 1, items: 1 },
        wants: [
          {
            id: 303,
            notes: "any price",
            basic_information: basic(303, "Mirage", "Fleetwood Mac", 3),
          },
        ],
      });
    return new Response("not found", { status: 404 });
  });
}

let db: TestDb;
let userId: string;
beforeEach(async () => {
  db = await migratedDb();
  setDb(db);
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??= "x".repeat(40);
  process.env.DISCOGS_TOKEN = "test-token-abcdefghijklmnopqrstuvwxyz";
  resetEnvCache();
  userId = await withTransaction(
    (tx) =>
      createUserWithPassword(tx, db.t, { name: "A", email: "a@example.com", passwordHash: "x" }),
    db,
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  setDb(undefined);
  delete process.env.DISCOGS_TOKEN;
  resetEnvCache();
  await db.cleanup();
});

describe(`Discogs import (${TEST_DIALECT})`, () => {
  it("imports collection and wantlist, and a re-run only reports changes", async () => {
    const state = { mediaCondition: "Near Mint (NM or M-)" };
    vi.stubGlobal("fetch", fakeDiscogs(state));
    const opts = {
      collection: true,
      wantlist: true,
      foldersAs: "locations" as const,
      details: false,
    };

    const first = await runDiscogsImport(userId, opts);
    expect(first.collection).toEqual({ added: 3, updated: 0, skipped: 0, failed: 0 });
    expect(first.wantlist).toEqual({ added: 1, skipped: 0, failed: 0 });
    expect(await countRows(db)).toMatchObject({ copy: 3, release: 3, master: 3, wishlist_item: 1 });
    expect((await listLocations(userId, db)).map((l) => [l.name, l.copies])).toEqual([
      ["Shelf A", 2],
    ]);
    expect((await listWishlist(userId, {}, db))[0]).toMatchObject({
      title: "Mirage",
      target: "release",
      notes: "any price",
    });

    const second = await runDiscogsImport(userId, opts);
    expect(second.collection).toEqual({ added: 0, updated: 0, skipped: 3, failed: 0 });
    expect(second.wantlist).toEqual({ added: 0, skipped: 1, failed: 0 });
    expect(await countRows(db)).toMatchObject({ copy: 3, release: 3, wishlist_item: 1 });

    state.mediaCondition = "Very Good Plus (VG+)";
    const third = await runDiscogsImport(userId, opts);
    expect(third.collection).toEqual({ added: 0, updated: 1, skipped: 2, failed: 0 });
    const [copy] = await db.db
      .select()
      .from(db.t.copy)
      .where((await import("drizzle-orm")).eq(db.t.copy.discogsInstanceId, "9001"));
    expect(copy).toMatchObject({
      mediaCondition: "VG+",
      notes: "signed",
      rating: 4,
      acquiredOn: "2020-01-02",
    });
  });
});
