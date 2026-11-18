/** Cached provider responses (CLAUDE.md: never re-fetch on page view). */
import { and, eq } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { exclusive } from "@/db/tx";

export async function getCached<T>(
  provider: string,
  key: string,
  maxAgeMs: number,
  h: DbHandle = getDb(),
): Promise<T | null> {
  const [row] = await h.db
    .select()
    .from(h.t.providerCache)
    .where(and(eq(h.t.providerCache.provider, provider), eq(h.t.providerCache.cacheKey, key)));
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > maxAgeMs) return null;
  return row.payload as T;
}

export async function putCached(
  provider: string,
  key: string,
  payload: unknown,
  h: DbHandle = getDb(),
) {
  const fetchedAt = new Date();
  await exclusive(async () => {
    await h.db
      .insert(h.t.providerCache)
      .values({ provider, cacheKey: key, payload, fetchedAt })
      .onConflictDoUpdate({
        target: [h.t.providerCache.provider, h.t.providerCache.cacheKey],
        set: { payload, fetchedAt },
      });
  }, h);
}
