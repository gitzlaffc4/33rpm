/**
 * Catalog tables (Phase 1), SQLite tree. Mirrors ../pg/catalog.ts; parity is enforced by
 * tests/unit/schema-parity.test.ts. Portability rules: docs/addendum-01-postgres-support.md.
 *
 * Shared metadata (artist, master, release, image covers) has no owner; what a person
 * owns or curates (copy, location, tag, wishlist_item, photos) carries user_id.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { Track } from "@/lib/catalog/types";
import { user } from "./auth";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const now = sql`(unixepoch('subsec') * 1000)`;
const timestamps = {
  createdAt: ts("created_at").notNull().default(now),
  updatedAt: ts("updated_at").notNull().default(now),
};

export const FORMATS = ["vinyl", "cd", "cassette", "other"] as const;
export const CONDITIONS = ["M", "NM", "VG+", "VG", "G+", "G", "F", "P"] as const;
export const DATA_SOURCES = ["discogs", "musicbrainz", "manual"] as const;
export const WISHLIST_STATUSES = ["wanted", "ordered", "acquired"] as const;

export const image = sqliteTable("image", {
  id: text("id").primaryKey(),
  /** Owner for user photos; null for shared cover art. */
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["cover", "photo"] }).notNull(),
  sourceUrl: text("source_url"),
  /** Path relative to IMAGES_DIR, without size suffix. */
  path: text("path").notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: text("sha256"),
  createdAt: ts("created_at").notNull().default(now),
});

export const artist = sqliteTable(
  "artist",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    sortName: text("sort_name"),
    /** Lowercased, diacritics stripped (rule 6). */
    nameSearch: text("name_search").notNull(),
    discogsId: text("discogs_id").unique(),
    musicbrainzId: text("musicbrainz_id").unique(),
    ...timestamps,
  },
  (t) => [index("artist_name_search_idx").on(t.nameSearch)],
);

export const master = sqliteTable(
  "master",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleSearch: text("title_search").notNull(),
    year: integer("year"),
    genres: text("genres", { mode: "json" }).$type<string[]>().notNull(),
    styles: text("styles", { mode: "json" }).$type<string[]>().notNull(),
    coverImageId: text("cover_image_id").references(() => image.id, { onDelete: "set null" }),
    discogsMasterId: text("discogs_master_id").unique(),
    musicbrainzReleaseGroupId: text("musicbrainz_release_group_id").unique(),
    ...timestamps,
  },
  (t) => [index("master_title_search_idx").on(t.titleSearch)],
);

export const masterArtist = sqliteTable(
  "master_artist",
  {
    masterId: text("master_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artist.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    joinPhrase: text("join_phrase").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.masterId, t.position] }),
    index("master_artist_artist_idx").on(t.artistId),
  ],
);

export const release = sqliteTable(
  "release",
  {
    id: text("id").primaryKey(),
    masterId: text("master_id")
      .notNull()
      .references(() => master.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    titleSearch: text("title_search").notNull(),
    format: text("format", { enum: FORMATS }).notNull(),
    /** e.g. ["LP", "Album", "Gatefold", "180g"] */
    formatDetails: text("format_details", { mode: "json" }).$type<string[]>().notNull(),
    /** Human summary, e.g. "Vinyl · LP, Album, Gatefold". */
    formatSummary: text("format_summary").notNull(),
    label: text("label"),
    catalogNumber: text("catalog_number"),
    /** Alphanumerics only, uppercased (rule 7). */
    catalogNumberNorm: text("catalog_number_norm"),
    country: text("country"),
    releaseYear: integer("release_year"),
    releaseDate: text("release_date"),
    coverImageId: text("cover_image_id").references(() => image.id, { onDelete: "set null" }),
    tracklist: text("tracklist", { mode: "json" }).$type<Track[]>().notNull(),
    notes: text("notes"),
    dataSource: text("data_source", { enum: DATA_SOURCES }).notNull(),
    discogsReleaseId: text("discogs_release_id").unique(),
    musicbrainzReleaseId: text("musicbrainz_release_id").unique(),
    /** Who created a manual entry (null for provider data). */
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    fetchedAt: ts("fetched_at"),
    ...timestamps,
  },
  (t) => [
    index("release_master_idx").on(t.masterId),
    index("release_catno_norm_idx").on(t.catalogNumberNorm),
  ],
);

export const releaseArtist = sqliteTable(
  "release_artist",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => release.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artist.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    joinPhrase: text("join_phrase").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.releaseId, t.position] }),
    index("release_artist_artist_idx").on(t.artistId),
  ],
);

export const releaseBarcode = sqliteTable(
  "release_barcode",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => release.id, { onDelete: "cascade" }),
    barcode: text("barcode").notNull(),
    /** Digits only (rule 7). */
    barcodeNorm: text("barcode_norm").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.releaseId, t.barcodeNorm] }),
    index("release_barcode_norm_idx").on(t.barcodeNorm),
  ],
);

export const location = sqliteTable(
  "location",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("location_user_name_uidx").on(t.userId, t.name)],
);

export const tag = sqliteTable(
  "tag",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNorm: text("name_norm").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("tag_user_name_uidx").on(t.userId, t.nameNorm)],
);

export const copy = sqliteTable(
  "copy",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    releaseId: text("release_id")
      .notNull()
      .references(() => release.id, { onDelete: "restrict" }),
    mediaCondition: text("media_condition", { enum: CONDITIONS }),
    sleeveCondition: text("sleeve_condition", { enum: CONDITIONS }),
    /** Integer minor units (cents) + ISO currency (rule 4). */
    priceMinor: integer("price_minor"),
    currency: text("currency"),
    /** YYYY-MM-DD */
    acquiredOn: text("acquired_on"),
    source: text("source"),
    locationId: text("location_id").references(() => location.id, { onDelete: "set null" }),
    notes: text("notes"),
    rating: integer("rating"),
    ...timestamps,
  },
  (t) => [
    index("copy_user_idx").on(t.userId),
    index("copy_release_idx").on(t.releaseId),
    index("copy_location_idx").on(t.locationId),
  ],
);

export const copyTag = sqliteTable(
  "copy_tag",
  {
    copyId: text("copy_id")
      .notNull()
      .references(() => copy.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.copyId, t.tagId] }), index("copy_tag_tag_idx").on(t.tagId)],
);

export const copyPhoto = sqliteTable(
  "copy_photo",
  {
    copyId: text("copy_id")
      .notNull()
      .references(() => copy.id, { onDelete: "cascade" }),
    imageId: text("image_id")
      .notNull()
      .references(() => image.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.copyId, t.imageId] })],
);

export const wishlistItem = sqliteTable(
  "wishlist_item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Exactly one of masterId ("any edition") or releaseId (this pressing). */
    masterId: text("master_id").references(() => master.id, { onDelete: "cascade" }),
    releaseId: text("release_id").references(() => release.id, { onDelete: "cascade" }),
    priority: integer("priority").notNull().default(2),
    maxPriceMinor: integer("max_price_minor"),
    currency: text("currency"),
    notes: text("notes"),
    status: text("status", { enum: WISHLIST_STATUSES }).notNull().default("wanted"),
    ...timestamps,
  },
  (t) => [
    index("wishlist_user_idx").on(t.userId),
    check("wishlist_one_target", sql`(${t.masterId} IS NULL) <> (${t.releaseId} IS NULL)`),
  ],
);

export const wishlistTag = sqliteTable(
  "wishlist_tag",
  {
    wishlistItemId: text("wishlist_item_id")
      .notNull()
      .references(() => wishlistItem.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.wishlistItemId, t.tagId] })],
);

/** Cached provider responses: never re-fetched on page view. */
export const providerCache = sqliteTable(
  "provider_cache",
  {
    provider: text("provider").notNull(),
    cacheKey: text("cache_key").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
    fetchedAt: ts("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.cacheKey] })],
);
