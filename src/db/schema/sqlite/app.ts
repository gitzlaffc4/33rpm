import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

/** Per-user preferences. One row per user, created lazily. */
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** AES-GCM encrypted (see src/lib/crypto.ts); never sent to the client. */
  discogsTokenEncrypted: text("discogs_token_encrypted"),
  /** Last 4 characters, for display ("••••1a2b"). */
  discogsTokenHint: text("discogs_token_hint"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  theme: text("theme", { enum: ["dark", "light", "system"] })
    .notNull()
    .default("dark"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});

/**
 * Small key/value table for instance-level state (not user data).
 * Used for the first-run setup code hash.
 */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
});
