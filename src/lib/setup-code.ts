import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { count, eq } from "drizzle-orm";

import type { Db } from "@/db";
import { appState, user } from "@/db/schema";

/**
 * First-run setup code.
 *
 * While the instance has no users, every server start generates a fresh one-time
 * code, stores only its SHA-256 hash, and prints the code to the logs. `/setup`
 * requires it. The code is consumed (deleted) atomically when the admin account
 * is created, and is never generated again once a user exists.
 */

const KEY = "setup_code_sha256";
// Crockford-ish alphabet: no 0/O/1/I/L to avoid transcription mistakes.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateSetupCode(): string {
  const groups = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(""),
  );
  return groups.join("-"); // 16 chars ≈ 79 bits of entropy
}

export function normalizeSetupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hash(code: string): string {
  return createHash("sha256").update(normalizeSetupCode(code)).digest("hex");
}

export function userCount(db: Db): number {
  return db.select({ n: count() }).from(user).get()?.n ?? 0;
}

export function needsSetup(db: Db): boolean {
  return userCount(db) === 0;
}

/**
 * Called on startup. Returns a new plaintext code if setup is needed (caller logs
 * it), or null if an admin already exists (any stale code is removed).
 */
export function issueSetupCodeIfNeeded(db: Db): string | null {
  if (!needsSetup(db)) {
    db.delete(appState).where(eq(appState.key, KEY)).run();
    return null;
  }
  const code = generateSetupCode();
  db.insert(appState)
    .values({ key: KEY, value: hash(code) })
    .onConflictDoUpdate({ target: appState.key, set: { value: hash(code), updatedAt: new Date() } })
    .run();
  return code;
}

/** Constant-time check without consuming the code. */
export function verifySetupCode(db: Db, code: string): boolean {
  const row = db.select().from(appState).where(eq(appState.key, KEY)).get();
  if (!row) return false;
  const a = Buffer.from(row.value, "hex");
  const b = Buffer.from(hash(code), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Atomically verify and delete the code. Only one caller can ever succeed, which
 * prevents two concurrent setup submissions from both creating admins.
 */
export function consumeSetupCode(db: Db, code: string): boolean {
  if (!verifySetupCode(db, code)) return false;
  const deleted = db
    .delete(appState)
    .where(eq(appState.key, KEY))
    .returning({ key: appState.key })
    .all();
  return deleted.length === 1;
}

export function formatSetupBanner(code: string, appUrl: string): string {
  const line = "=".repeat(64);
  return [
    "",
    line,
    "  33rpm first-run setup",
    "",
    `  Open ${appUrl}/setup and enter this one-time setup code:`,
    "",
    `      ${code}`,
    "",
    "  A new code is generated on every restart until an admin exists.",
    line,
    "",
  ].join("\n");
}
