import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { getDb, type DbHandle } from "@/db";
import { consumeAppState, deleteAppState, getAppState, setAppState } from "@/db/repos/app-state";
import { countUsers } from "@/db/repos/users";

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

export async function needsSetup(h: DbHandle = getDb()): Promise<boolean> {
  return (await countUsers(h)) === 0;
}

/**
 * Called on startup (and by the `create-setup-code` CLI). Returns a new plaintext
 * code if setup is needed (the caller prints it), or null if a user already
 * exists, in which case any stale code is removed.
 */
export async function issueSetupCodeIfNeeded(h: DbHandle = getDb()): Promise<string | null> {
  if (!(await needsSetup(h))) {
    await deleteAppState(KEY, h);
    return null;
  }
  const code = generateSetupCode();
  await setAppState(KEY, hash(code), h);
  return code;
}

/** Constant-time check without consuming the code. */
export async function verifySetupCode(code: string, h: DbHandle = getDb()): Promise<boolean> {
  const stored = await getAppState(KEY, h);
  if (!stored) return false;
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(hash(code), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Atomically verify and delete the code. Only one caller can ever succeed, which
 * prevents two concurrent setup submissions from both creating admins.
 */
export async function consumeSetupCode(code: string, h: DbHandle = getDb()): Promise<boolean> {
  if (!(await verifySetupCode(code, h))) return false;
  return consumeAppState(KEY, hash(code), h);
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
