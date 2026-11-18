/**
 * Catalog tables (Phase 1), PostgreSQL tree. Mirrors ../sqlite/catalog.ts; parity is enforced by
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
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { Track } from "@/lib/catalog/types";
import {
  CONDITIONS,
  DATA_SOURCES,
  FORMATS,
  IMPORT_JOB_STATUSES,
  SCAN_STATUSES,
  WISHLIST_STATUSES,
} from "../sqlite/catalog";
import { user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};

export const image = pgTable("image", {
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
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const artist = pgTable(
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

export const master = pgTable(
  "master",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleSearch: text("title_search").notNull(),
    year: integer("year"),
    genres: jsonb("genres").$type<string[]>().notNull(),
    styles: jsonb("styles").$type<string[]>().notNull(),
    coverImageId: text("cover_image_id").references(() => image.id, { onDelete: "set null" }),
    discogsMasterId: text("discogs_master_id").unique(),
    musicbrainzReleaseGroupId: text("musicbrainz_release_group_id").unique(),
    ...timestamps,
  },
  (t) => [index("master_title_search_idx").on(t.titleSearch)],
);

export const masterArtist = pgTable(
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

export const release = pgTable(
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
    formatDetails: jsonb("format_details").$type<string[]>().notNull(),
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
    tracklist: jsonb("tracklist").$type<Track[]>().notNull(),
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

export const releaseArtist = pgTable(
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

export const releaseBarcode = pgTable(
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

export const location = pgTable(
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

export const tag = pgTable(
  "tag",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNorm: text("name_norm").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tag_user_name_uidx").on(t.userId, t.nameNorm)],
);

export const copy = pgTable(
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
    /** Discogs collection instance this copy was imported from (idempotent re-sync). */
    discogsInstanceId: text("discogs_instance_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("copy_user_discogs_instance_uidx").on(t.userId, t.discogsInstanceId),
    index("copy_user_idx").on(t.userId),
    index("copy_release_idx").on(t.releaseId),
    index("copy_location_idx").on(t.locationId),
  ],
);

export const copyTag = pgTable(
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

export const copyPhoto = pgTable(
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

export const wishlistItem = pgTable(
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
    /** The copy that fulfilled this item ("Got it"). */
    acquiredCopyId: text("acquired_copy_id").references(() => copy.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("wishlist_user_idx").on(t.userId),
    check("wishlist_one_target", sql`(${t.masterId} IS NULL) <> (${t.releaseId} IS NULL)`),
  ],
);

export const wishlistTag = pgTable(
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
export const providerCache = pgTable(
  "provider_cache",
  {
    provider: text("provider").notNull(),
    cacheKey: text("cache_key").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    fetchedAt: ts("fetched_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.cacheKey] })],
);

/** Crate mode scan queue (see ../sqlite/catalog.ts). */
export const scanItem = pgTable(
  "scan_item",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    barcode: text("barcode").notNull(),
    status: text("status", { enum: SCAN_STATUSES }).notNull().default("pending"),
    candidates: jsonb("candidates").$type<unknown[]>().notNull(),
    releaseId: text("release_id").references(() => release.id, { onDelete: "set null" }),
    copyId: text("copy_id").references(() => copy.id, { onDelete: "set null" }),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("scan_item_user_status_idx").on(t.userId, t.status)],
);

/** Background import jobs (see ../sqlite/catalog.ts). */
export const importJob = pgTable(
  "import_job",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status", { enum: IMPORT_JOB_STATUSES }).notNull().default("queued"),
    progress: jsonb("progress")
      .$type<{ done: number; total: number | null; step: string }>()
      .notNull(),
    report: jsonb("report").$type<Record<string, unknown> | null>(),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("import_job_user_idx").on(t.userId)],
);
