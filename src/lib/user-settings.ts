import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { userSettings } from "@/db/schema";

export type UserSettings = typeof userSettings.$inferSelect;

/** Settings row for a user, created with defaults on first access. */
export function getUserSettings(userId: string): UserSettings {
  const db = getDb();
  const existing = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
  if (existing) return existing;
  return (
    db.insert(userSettings).values({ userId }).onConflictDoNothing().returning().get() ??
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).get()!
  );
}
