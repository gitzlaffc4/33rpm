/**
 * Every table, in dependency order: a table only references tables listed before it.
 * The Phase 4 copy engine (SQLite <-> PostgreSQL) copies in this order and deletes in
 * reverse. tests/unit/schema-parity.test.ts verifies the ordering against the FKs and
 * that every table in both schema trees is listed exactly once.
 *
 * Add new tables here in the same commit that adds them to both schema trees.
 */
export const TABLES_IN_DEPENDENCY_ORDER = [
  "user",
  "session",
  "account",
  "verification",
  "app_state",
  "user_settings",
  "image",
  "artist",
  "master",
  "master_artist",
  "release",
  "release_artist",
  "release_barcode",
  "location",
  "tag",
  "copy",
  "copy_tag",
  "copy_photo",
  "wishlist_item",
  "wishlist_tag",
  "provider_cache",
  "scan_item",
  "import_job",
] as const;

export type TableName = (typeof TABLES_IN_DEPENDENCY_ORDER)[number];
