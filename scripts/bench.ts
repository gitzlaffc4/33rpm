/**
 * Performance check: fill a database with N releases + copies, then time the queries
 * behind the main screens.
 *
 *   npm run bench -- <database-url> [count=2500]
 *
 * Use an EMPTY throwaway database (it's migrated and filled with synthetic data).
 */
import os from "node:os";
import path from "node:path";

import { openDatabase } from "@/db/client";
import { parseDatabaseUrl } from "@/db/dialect";
import { migrateDatabase } from "@/db/migrate";
import {
  createCopy,
  createManualRelease,
  ensureLocation,
  getMasterPage,
  listAlbums,
} from "@/db/repos/catalog";
import { exportCollection } from "@/db/repos/export";
import { collectionStats } from "@/db/repos/stats";
import { createUserWithPassword } from "@/db/repos/users";
import { addToWishlist, listWishlist } from "@/db/repos/wishlist";
import { getSearchIndex } from "@/db/search";
import { withTransaction } from "@/db/tx";

const WORDS =
  "midnight river golden echo velvet static harbor neon paper garden silver thunder hollow crystal".split(
    " ",
  );
const GENRES = ["Rock", "Jazz", "Electronic", "Hip Hop", "Folk", "Soul", "Classical", "Pop"];
const word = (i: number) => WORDS[i % WORDS.length];

async function time<T>(label: string, fn: () => Promise<T>, runs = 5) {
  await fn(); // warm-up
  const times: number[] = [];
  let out!: T;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    out = await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(
    `  ${label.padEnd(36)} median ${times[Math.floor(runs / 2)].toFixed(1).padStart(7)} ms`,
  );
  return out;
}

async function main() {
  const [url, countArg] = process.argv.slice(2);
  if (!url) throw new Error("Usage: npm run bench -- <database-url> [count]");
  const n = Number(countArg ?? 2500);
  const h = openDatabase(parseDatabaseUrl(url));
  await migrateDatabase(h, {
    migrationsRoot: path.join(process.cwd(), "drizzle"),
    backupsDir: path.join(os.tmpdir(), "33rpm-bench"),
  });
  console.log(
    `33rpm bench: ${h.dialect}, ${n} copies, ${os.cpus()[0]?.model ?? "?"} × ${os.cpus().length}, node ${process.version}`,
  );

  const userId = await withTransaction(
    (tx) =>
      createUserWithPassword(tx, h.t, {
        name: "Bench",
        email: `bench-${Date.now()}@example.com`,
        passwordHash: "x",
      }),
    h,
  );
  const locations = await Promise.all(
    ["Shelf A", "Shelf B", "Crate 1", "CD Tower"].map((l) => ensureLocation(userId, l, h)),
  );
  const started = performance.now();
  let firstMaster = "";
  for (let i = 0; i < n; i++) {
    const { releaseId, masterId } = await createManualRelease(
      userId,
      {
        artist: `${word(i)} ${word(i * 7 + 3)} ${i % 400}`,
        title: `${word(i * 3)} ${word(i * 5 + 1)} ${i}`,
        year: 1955 + (i % 70),
        format: (["vinyl", "cd", "cassette", "other"] as const)[i % 4],
        formatDetails: ["LP", "Album"],
        label: `Label ${i % 120}`,
        catalogNumber: `CAT-${i}`,
        country: "US",
        barcode: String(100000000000 + i),
        tracklist: Array.from({ length: 10 }, (_, k) => ({
          position: `A${k + 1}`,
          title: `Track ${k + 1}`,
          duration: "3:30",
        })),
        notes: null,
      },
      null,
      h,
    );
    if (!firstMaster) firstMaster = masterId;
    await createCopy(
      userId,
      releaseId,
      {
        mediaCondition: "VG+",
        sleeveCondition: "VG",
        priceMinor: 500 + (i % 50) * 100,
        currency: "USD",
        acquiredOn: `${2015 + (i % 10)}-0${1 + (i % 9)}-15`,
        source: null,
        locationId: locations[i % locations.length],
        notes: null,
        rating: (i % 5) + 1,
        tags: i % 10 === 0 ? ["favorite"] : [],
      },
      h,
    );
    if (i % 25 === 0)
      await addToWishlist(userId, { masterId }, { priority: ((i % 3) + 1) as 1 | 2 | 3 }, h);
    if ((i + 1) % 500 === 0)
      console.log(`  … ${i + 1} added (${((performance.now() - started) / 1000).toFixed(1)} s)`);
  }
  // Genres on masters (manual entries have none).
  const masters = await h.db.select({ id: h.t.master.id }).from(h.t.master);
  const { eq } = await import("drizzle-orm");
  await withTransaction(async (tx) => {
    for (const [i, m] of masters.entries()) {
      await tx
        .update(h.t.master)
        .set({ genres: [GENRES[i % GENRES.length]] })
        .where(eq(h.t.master.id, m.id));
    }
  }, h);

  console.log("Timings:");
  await time("Library: all albums (artist sort)", () => listAlbums(userId, {}, h));
  await time("Library: format + decade filter", () =>
    listAlbums(userId, { format: "vinyl", decade: 1970 }, h),
  );
  await time("Library: genre filter", () => listAlbums(userId, { genre: "Jazz" }, h));
  await time("Library: text filter", () => listAlbums(userId, { q: "velvet" }, h));
  const index = getSearchIndex(h);
  await time("Search index: 'midn gold'", () => index.search("midn gold", 300));
  await time("Search index: catalog number", () => index.search("CAT-1234", 300));
  await time("Album page", () => getMasterPage(userId, firstMaster, h));
  await time("Wishlist", () => listWishlist(userId, {}, h));
  await time("Stats", () => collectionStats(userId, h));
  await time("Export collection (all rows)", () => exportCollection(userId, h), 3);
  await h.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
