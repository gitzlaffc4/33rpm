/** App tables, PostgreSQL tree. Must mirror ../sqlite/app.ts. */
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  discogsTokenEncrypted: text("discogs_token_encrypted"),
  discogsTokenHint: text("discogs_token_hint"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  theme: text("theme", { enum: ["dark", "light", "system"] })
    .notNull()
    .default("dark"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const appState = pgTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
