/** Instance-level key/value state (e.g. the first-run setup code hash). */
import { and, eq } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { exclusive } from "@/db/tx";

export async function getAppState(key: string, h: DbHandle = getDb()): Promise<string | null> {
  const rows = await h.db
    .select({ value: h.t.appState.value })
    .from(h.t.appState)
    .where(eq(h.t.appState.key, key));
  return rows[0]?.value ?? null;
}

export async function setAppState(key: string, value: string, h: DbHandle = getDb()) {
  await exclusive(async () => {
    await h.db
      .insert(h.t.appState)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: h.t.appState.key, set: { value, updatedAt: new Date() } });
  }, h);
}

export async function deleteAppState(key: string, h: DbHandle = getDb()) {
  await exclusive(async () => {
    await h.db.delete(h.t.appState).where(eq(h.t.appState.key, key));
  }, h);
}

/**
 * Delete the key if it still holds `value`. Returns true for exactly one caller,
 * even under concurrency, which makes it safe for one-time tokens.
 */
export async function consumeAppState(
  key: string,
  value: string,
  h: DbHandle = getDb(),
): Promise<boolean> {
  return exclusive(async () => {
    const deleted = await h.db
      .delete(h.t.appState)
      .where(and(eq(h.t.appState.key, key), eq(h.t.appState.value, value)))
      .returning({ key: h.t.appState.key });
    return deleted.length === 1;
  }, h);
}
