/** Per-user preferences. */
import { eq } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { exclusive } from "@/db/tx";
import type { sqliteSchema } from "@/db/schema";

export type UserSettings = typeof sqliteSchema.userSettings.$inferSelect;
export type UserSettingsUpdate = Partial<
  Omit<typeof sqliteSchema.userSettings.$inferInsert, "userId" | "updatedAt">
>;

/** Settings row for a user, created with defaults on first access. */
export async function getUserSettings(
  userId: string,
  h: DbHandle = getDb(),
): Promise<UserSettings> {
  const find = async () =>
    (await h.db.select().from(h.t.userSettings).where(eq(h.t.userSettings.userId, userId)))[0];
  const existing = await find();
  if (existing) return existing;
  await exclusive(async () => {
    await h.db.insert(h.t.userSettings).values({ userId }).onConflictDoNothing();
  }, h);
  return (await find())!;
}

export async function updateUserSettings(
  userId: string,
  values: UserSettingsUpdate,
  h: DbHandle = getDb(),
) {
  await getUserSettings(userId, h); // ensure the row exists
  await exclusive(async () => {
    await h.db
      .update(h.t.userSettings)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(h.t.userSettings.userId, userId));
  }, h);
}
