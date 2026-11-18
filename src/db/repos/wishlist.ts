/**
 * Wishlist: each item targets either a master ("any edition") or one release (this
 * pressing). Statuses: wanted → ordered → acquired.
 */
import { and, asc, eq, inArray, or } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { newId } from "@/db/ids";
import type { Schema } from "@/db/schema";
import { withTransaction, exclusive } from "@/db/tx";
import { searchKey } from "@/lib/catalog/normalize";
import type { Format } from "@/lib/catalog/types";
import { creditsDisplay } from "./catalog";

export type WishlistStatus = "wanted" | "ordered" | "acquired";
export type WishTarget =
  { masterId: string; releaseId?: never } | { releaseId: string; masterId?: never };

export type WishlistInput = {
  priority: 1 | 2 | 3;
  maxPriceMinor: number | null;
  currency: string | null;
  notes: string | null;
  status: WishlistStatus;
  tags: string[];
};

type Tx = Parameters<Parameters<typeof withTransaction>[0]>[0];

async function setWishTags(tx: Tx, t: Schema, userId: string, itemId: string, names: string[]) {
  await tx.delete(t.wishlistTag).where(eq(t.wishlistTag.wishlistItemId, itemId));
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().slice(0, 50);
    const norm = searchKey(name);
    if (norm && !wanted.has(norm)) wanted.set(norm, name);
  }
  if (!wanted.size) return;
  await tx
    .insert(t.tag)
    .values([...wanted].map(([nameNorm, name]) => ({ id: newId(), userId, name, nameNorm })))
    .onConflictDoNothing();
  const tags = await tx
    .select({ id: t.tag.id })
    .from(t.tag)
    .where(and(eq(t.tag.userId, userId), inArray(t.tag.nameNorm, [...wanted.keys()])));
  await tx
    .insert(t.wishlistTag)
    .values(tags.map((tg) => ({ wishlistItemId: itemId, tagId: tg.id })));
}

/** Open (not acquired) item for the same target, if any. */
async function findOpen(tx: Tx, t: Schema, userId: string, target: WishTarget) {
  const [row] = await tx
    .select({ id: t.wishlistItem.id })
    .from(t.wishlistItem)
    .where(
      and(
        eq(t.wishlistItem.userId, userId),
        target.masterId
          ? eq(t.wishlistItem.masterId, target.masterId)
          : eq(t.wishlistItem.releaseId, target.releaseId!),
        inArray(t.wishlistItem.status, ["wanted", "ordered"]),
      ),
    );
  return row?.id ?? null;
}

/** Add (or, if already wanted, update) a wishlist item. Returns its id. */
export async function addToWishlist(
  userId: string,
  target: WishTarget,
  input: Partial<WishlistInput> = {},
  h: DbHandle = getDb(),
): Promise<{ id: string; created: boolean }> {
  return withTransaction(async (tx) => {
    const t = h.t;
    const existing = await findOpen(tx, t, userId, target);
    if (existing) return { id: existing, created: false };
    const id = newId();
    await tx.insert(t.wishlistItem).values({
      id,
      userId,
      masterId: target.masterId ?? null,
      releaseId: target.releaseId ?? null,
      priority: input.priority ?? 2,
      maxPriceMinor: input.maxPriceMinor ?? null,
      currency: input.currency ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "wanted",
    });
    await setWishTags(tx, t, userId, id, input.tags ?? []);
    return { id, created: true };
  }, h);
}

export async function updateWishlistItem(
  userId: string,
  id: string,
  input: WishlistInput,
  h: DbHandle = getDb(),
): Promise<boolean> {
  return withTransaction(async (tx) => {
    const { tags, ...values } = input;
    const rows = await tx
      .update(h.t.wishlistItem)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(h.t.wishlistItem.id, id), eq(h.t.wishlistItem.userId, userId)))
      .returning({ id: h.t.wishlistItem.id });
    if (!rows.length) return false;
    await setWishTags(tx, h.t, userId, id, tags);
    return true;
  }, h);
}

export async function deleteWishlistItem(userId: string, id: string, h: DbHandle = getDb()) {
  await exclusive(async () => {
    await h.db
      .delete(h.t.wishlistItem)
      .where(and(eq(h.t.wishlistItem.id, id), eq(h.t.wishlistItem.userId, userId)));
  }, h);
}

/** "Got it": link the new copy and mark the item acquired. */
export async function markAcquired(
  userId: string,
  id: string,
  copyId: string,
  h: DbHandle = getDb(),
) {
  await exclusive(async () => {
    await h.db
      .update(h.t.wishlistItem)
      .set({ status: "acquired", acquiredCopyId: copyId, updatedAt: new Date() })
      .where(and(eq(h.t.wishlistItem.id, id), eq(h.t.wishlistItem.userId, userId)));
  }, h);
}

export type WishlistEntry = {
  id: string;
  target: "master" | "release";
  masterId: string;
  releaseId: string | null;
  title: string;
  artist: string;
  sortArtist: string;
  year: number | null;
  format: Format | null;
  formatSummary: string | null;
  label: string | null;
  catalogNumber: string | null;
  coverImageId: string | null;
  priority: number;
  maxPriceMinor: number | null;
  currency: string | null;
  notes: string | null;
  status: WishlistStatus;
  tags: string[];
  acquiredCopyId: string | null;
  createdAt: Date;
};

type WishRow = Schema["wishlistItem"]["$inferSelect"];

async function hydrate(rows: WishRow[], h: DbHandle) {
  const t = h.t;
  if (!rows.length) return [];
  const releaseIds = rows.flatMap((r) => (r.releaseId ? [r.releaseId] : []));
  const releases = releaseIds.length
    ? await h.db.select().from(t.release).where(inArray(t.release.id, releaseIds))
    : [];
  const relById = new Map(releases.map((r) => [r.id, r]));
  const masterIds = [
    ...new Set(
      rows
        .map((r) => r.masterId ?? relById.get(r.releaseId!)?.masterId)
        .filter(Boolean) as string[],
    ),
  ];
  const [masters, artists, tags] = await Promise.all([
    h.db.select().from(t.master).where(inArray(t.master.id, masterIds)),
    h.db
      .select({
        masterId: t.masterArtist.masterId,
        name: t.artist.name,
        sortName: t.artist.sortName,
        joinPhrase: t.masterArtist.joinPhrase,
      })
      .from(t.masterArtist)
      .innerJoin(t.artist, eq(t.artist.id, t.masterArtist.artistId))
      .where(inArray(t.masterArtist.masterId, masterIds))
      .orderBy(asc(t.masterArtist.masterId), asc(t.masterArtist.position)),
    h.db
      .select({ itemId: t.wishlistTag.wishlistItemId, name: t.tag.name })
      .from(t.wishlistTag)
      .innerJoin(t.tag, eq(t.tag.id, t.wishlistTag.tagId))
      .where(
        inArray(
          t.wishlistTag.wishlistItemId,
          rows.map((r) => r.id),
        ),
      ),
  ]);
  const masterById = new Map(masters.map((m) => [m.id, m]));
  return rows.map((r): WishlistEntry => {
    const rel = r.releaseId ? relById.get(r.releaseId) : undefined;
    const masterId = r.masterId ?? rel!.masterId;
    const m = masterById.get(masterId)!;
    const a = artists.filter((x) => x.masterId === masterId);
    return {
      id: r.id,
      target: r.releaseId ? "release" : "master",
      masterId,
      releaseId: r.releaseId,
      title: m.title,
      artist: creditsDisplay(a),
      sortArtist: searchKey(a[0]?.sortName ?? a[0]?.name ?? ""),
      year: m.year,
      format: rel?.format ?? null,
      formatSummary: rel?.formatSummary ?? null,
      label: rel?.label ?? null,
      catalogNumber: rel?.catalogNumber ?? null,
      coverImageId: rel?.coverImageId ?? m.coverImageId,
      priority: r.priority,
      maxPriceMinor: r.maxPriceMinor,
      currency: r.currency,
      notes: r.notes,
      status: r.status,
      tags: tags.filter((x) => x.itemId === r.id).map((x) => x.name),
      acquiredCopyId: r.acquiredCopyId,
      createdAt: r.createdAt,
    };
  });
}

export async function listWishlist(
  userId: string,
  opts: { status?: "open" | "acquired"; sort?: "priority" | "artist" | "format" | "added" } = {},
  h: DbHandle = getDb(),
): Promise<WishlistEntry[]> {
  const t = h.t;
  const rows = await h.db
    .select()
    .from(t.wishlistItem)
    .where(
      and(
        eq(t.wishlistItem.userId, userId),
        opts.status === "acquired"
          ? eq(t.wishlistItem.status, "acquired")
          : inArray(t.wishlistItem.status, ["wanted", "ordered"]),
      ),
    );
  const items = await hydrate(rows, h);
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const byArtist = (a: WishlistEntry, b: WishlistEntry) =>
    collator.compare(a.sortArtist, b.sortArtist) || collator.compare(a.title, b.title);
  const formatRank = (f: Format | null) =>
    f ? ["vinyl", "cd", "cassette", "other"].indexOf(f) : 9;
  const sort = opts.sort ?? "priority";
  return items.sort((a, b) => {
    if (sort === "artist") return byArtist(a, b);
    if (sort === "format") return formatRank(a.format) - formatRank(b.format) || byArtist(a, b);
    if (sort === "added") return b.createdAt.getTime() - a.createdAt.getTime();
    return a.priority - b.priority || byArtist(a, b);
  });
}

export async function getWishlistItem(userId: string, id: string, h: DbHandle = getDb()) {
  const rows = await h.db
    .select()
    .from(h.t.wishlistItem)
    .where(and(eq(h.t.wishlistItem.id, id), eq(h.t.wishlistItem.userId, userId)));
  return (await hydrate(rows, h))[0] ?? null;
}

/** Open wishlist items touching these masters/releases (badges and the in-store check). */
export async function wishlistFor(
  userId: string,
  { masterIds = [], releaseIds = [] }: { masterIds?: string[]; releaseIds?: string[] },
  h: DbHandle = getDb(),
) {
  const t = h.t;
  if (!masterIds.length && !releaseIds.length) return [];
  const conds = [];
  if (masterIds.length) conds.push(inArray(t.wishlistItem.masterId, masterIds));
  if (releaseIds.length) conds.push(inArray(t.wishlistItem.releaseId, releaseIds));
  return h.db
    .select({
      id: t.wishlistItem.id,
      masterId: t.wishlistItem.masterId,
      releaseId: t.wishlistItem.releaseId,
      priority: t.wishlistItem.priority,
      status: t.wishlistItem.status,
      maxPriceMinor: t.wishlistItem.maxPriceMinor,
      currency: t.wishlistItem.currency,
    })
    .from(t.wishlistItem)
    .where(
      and(
        eq(t.wishlistItem.userId, userId),
        inArray(t.wishlistItem.status, ["wanted", "ordered"]),
        or(...conds),
      ),
    );
}

/** Counts of copies the user owns for releases / masters. */
export async function ownedCounts(
  userId: string,
  { masterIds = [], releaseIds = [] }: { masterIds?: string[]; releaseIds?: string[] },
  h: DbHandle = getDb(),
) {
  const t = h.t;
  const releases = new Map<string, number>();
  const masters = new Map<string, number>();
  if (!masterIds.length && !releaseIds.length) return { releases, masters };
  const conds = [];
  if (releaseIds.length) conds.push(inArray(t.copy.releaseId, releaseIds));
  if (masterIds.length) conds.push(inArray(t.release.masterId, masterIds));
  const rows = await h.db
    .select({ releaseId: t.copy.releaseId, masterId: t.release.masterId })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .where(and(eq(t.copy.userId, userId), or(...conds)));
  for (const r of rows) {
    releases.set(r.releaseId, (releases.get(r.releaseId) ?? 0) + 1);
    masters.set(r.masterId, (masters.get(r.masterId) ?? 0) + 1);
  }
  return { releases, masters };
}
