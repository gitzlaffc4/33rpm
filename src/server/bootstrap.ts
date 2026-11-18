import path from "node:path";

import { getDb } from "@/db";
import { redactDatabaseUrl } from "@/db/dialect";
import { migrateDatabase } from "@/db/migrate";
import { EnvError, getEnv } from "@/env";
import { formatSetupBanner, issueSetupCodeIfNeeded } from "@/lib/setup-code";

/**
 * Runs once per server start (from instrumentation.ts), before any request:
 * 1. validate env  2. migrate the DB (SQLite: snapshot first; PostgreSQL: advisory lock)
 * 3. issue a setup code if no users exist.
 */
export async function bootstrap() {
  let env;
  try {
    env = getEnv();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(`[33rpm] ${e.message}`);
      console.error("[33rpm] See .env.example / README for the full list of variables.");
      process.exit(1);
    }
    throw e;
  }

  const handle = getDb();
  console.log(
    `[33rpm] Database: ${handle.dialect === "pg" ? "PostgreSQL" : "SQLite"} (${redactDatabaseUrl(env.DATABASE_URL)})`,
  );
  const result = await migrateDatabase(handle, {
    migrationsRoot: path.join(process.cwd(), "drizzle"),
    backupsDir: env.BACKUPS_DIR,
  });
  if (result.snapshot) console.log(`[33rpm] Pre-migration snapshot: ${result.snapshot}`);
  if (result.applied.length) {
    // Only on upgrades: a brand-new database (first migration) has nothing to back up.
    if (handle.dialect === "pg" && !result.applied.includes("0000_init")) {
      console.log(
        "[33rpm] PostgreSQL: no automatic pre-migration snapshot. Back up with pg_dump before upgrading.",
      );
    }
    console.log(`[33rpm] Applied migrations: ${result.applied.join(", ")}`);
  }

  const code = await issueSetupCodeIfNeeded(handle);
  if (code) console.log(formatSetupBanner(code, env.APP_URL));

  // Crate-mode lookups interrupted by a restart.
  const { resumePendingLookups } = await import("@/lib/catalog/scan-lookup");
  const resumed = await resumePendingLookups();
  if (resumed) console.log(`[33rpm] Resuming ${resumed} pending scan lookup(s).`);

  if (!env.SECURE_COOKIES && env.NODE_ENV === "production") {
    console.warn(
      "[33rpm] APP_URL is not https: session cookies are not marked Secure. Use HTTPS outside a trusted LAN.",
    );
  }
}
