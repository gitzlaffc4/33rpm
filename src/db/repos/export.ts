/** Per-user export rows (CSV/JSON): the collection and the wishlist, flattened. */
import { asc, eq, inArray } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { creditsDisplay } from "./catalog";
import { listWishlist } from "./wishlist";

export const COLLECTION_COLUMNS = [
  "copy_id",
  "artist",
  "title",
  "format",
  "format_details",
  "label",
  "catalog_number",
  "barcode",
  "country",
  "year",
  "media_condition",
  "sleeve_condition",
  "price",
  "currency",
  "acquired_on",
  "source",
  "location",
  "tags",
  "rating",
  "notes",
  "added_at",
  "discogs_release_id",
  "musicbrainz_release_id",
] as const;

export type CollectionRow = Record<(typeof COLLECTION_COLUMNS)[number], string | number | null>;

/** Minor units → "24.99" (2 decimals; 0 for zero-decimal currencies like JPY). */
function money(minor: number | null, currency: string | null) {
  if (minor === null) return null;
  const digits = currency && ["JPY", "KRW", "HUF"].includes(currency) ? 0 : 2;
  return (minor / 10 ** digits).toFixed(digits);
}

export async function exportCollection(
  userId: string,
  h: DbHandle = getDb(),
): Promise<CollectionRow[]> {
  const t = h.t;
  const rows = await h.db
    .select({ copy: t.copy, release: t.release, location: t.location.name })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .leftJoin(t.location, eq(t.location.id, t.copy.locationId))
    .where(eq(t.copy.userId, userId))
    .orderBy(asc(t.copy.createdAt), asc(t.copy.id));
  const releaseIds = [...new Set(rows.map((r) => r.release.id))];
  const copyIds = rows.map((r) => r.copy.id);
  const [artists, barcodes, tags] = await Promise.all([
    releaseIds.length
      ? h.db
          .select({
            releaseId: t.releaseArtist.releaseId,
            name: t.artist.name,
            joinPhrase: t.releaseArtist.joinPhrase,
          })
          .from(t.releaseArtist)
          .innerJoin(t.artist, eq(t.artist.id, t.releaseArtist.artistId))
          .where(inArray(t.releaseArtist.releaseId, releaseIds))
          .orderBy(asc(t.releaseArtist.releaseId), asc(t.releaseArtist.position))
      : [],
    releaseIds.length
      ? h.db
          .select({ releaseId: t.releaseBarcode.releaseId, barcode: t.releaseBarcode.barcode })
          .from(t.releaseBarcode)
          .where(inArray(t.releaseBarcode.releaseId, releaseIds))
      : [],
    copyIds.length
      ? h.db
          .select({ copyId: t.copyTag.copyId, name: t.tag.name })
          .from(t.copyTag)
          .innerJoin(t.tag, eq(t.tag.id, t.copyTag.tagId))
          .where(inArray(t.copyTag.copyId, copyIds))
      : [],
  ]);
  return rows.map(({ copy: c, release: r, location }) => ({
    copy_id: c.id,
    artist: creditsDisplay(artists.filter((a) => a.releaseId === r.id)),
    title: r.title,
    format: r.format,
    format_details: r.formatDetails.join(", "),
    label: r.label,
    catalog_number: r.catalogNumber,
    barcode: barcodes
      .filter((b) => b.releaseId === r.id)
      .map((b) => b.barcode)
      .join(" | "),
    country: r.country,
    year: r.releaseYear,
    media_condition: c.mediaCondition,
    sleeve_condition: c.sleeveCondition,
    price: money(c.priceMinor, c.currency),
    currency: c.currency,
    acquired_on: c.acquiredOn,
    source: c.source,
    location,
    tags: tags
      .filter((x) => x.copyId === c.id)
      .map((x) => x.name)
      .join(", "),
    rating: c.rating,
    notes: c.notes,
    added_at: c.createdAt.toISOString(),
    discogs_release_id: r.discogsReleaseId,
    musicbrainz_release_id: r.musicbrainzReleaseId,
  }));
}

export const WISHLIST_COLUMNS = [
  "wishlist_id",
  "artist",
  "title",
  "target",
  "format",
  "catalog_number",
  "priority",
  "max_price",
  "currency",
  "status",
  "tags",
  "notes",
  "added_at",
] as const;

export async function exportWishlist(userId: string, h: DbHandle = getDb()) {
  const items = [
    ...(await listWishlist(userId, { sort: "added" }, h)),
    ...(await listWishlist(userId, { status: "acquired", sort: "added" }, h)),
  ];
  return items.map((w) => ({
    wishlist_id: w.id,
    artist: w.artist,
    title: w.title,
    target: w.target === "master" ? "any edition" : "this pressing",
    format: w.format,
    catalog_number: w.catalogNumber,
    priority: w.priority,
    max_price: money(w.maxPriceMinor, w.currency),
    currency: w.currency,
    status: w.status,
    tags: w.tags.join(", "),
    notes: w.notes,
    added_at: w.createdAt.toISOString(),
  }));
}
