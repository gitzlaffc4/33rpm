import path from "node:path";

import { getDb } from "@/db";
import { runMigrations } from "@/db/migrate";
import { EnvError, getEnv } from "@/env";
import { formatSetupBanner, issueSetupCodeIfNeeded } from "@/lib/setup-code";

/**
 * Runs once per server start (from instrumentation.ts), before any request:
 * 1. validate env  2. snapshot + migrate the DB  3. issue a setup code if no users exist.
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

  const db = getDb();
  const result = runMigrations({
    sqlite: db.$client,
    migrationsFolder: path.join(process.cwd(), "drizzle"),
    backupsDir: env.BACKUPS_DIR,
  });
  if (result.snapshot) console.log(`[33rpm] Pre-migration snapshot: ${result.snapshot}`);
  if (result.applied.length) {
    console.log(`[33rpm] Applied migrations: ${result.applied.join(", ")}`);
  }

  const code = issueSetupCodeIfNeeded(db);
  if (code) console.log(formatSetupBanner(code, env.APP_URL));

  if (!env.SECURE_COOKIES && env.NODE_ENV === "production") {
    console.warn(
      "[33rpm] APP_URL is not https: session cookies are not marked Secure. Use HTTPS outside a trusted LAN.",
    );
  }
}
