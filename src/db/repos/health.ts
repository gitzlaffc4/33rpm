import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { getDb, type DbHandle } from "@/db";

/**
 * Round-trip a trivial query; throws if the database is unreachable.
 * Raw SQL lives here behind one function with both dialect implementations
 * (addendum rule 9); covered by the integration tests on both backends.
 */
export async function pingDatabase(h: DbHandle = getDb()): Promise<void> {
  if (h.dialect === "pg") {
    await (h.db as unknown as NodePgDatabase).execute(sql`SELECT 1`);
  } else {
    h.sqlite!.prepare("SELECT 1").get();
  }
}
