import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Symmetric encryption for secrets stored in the database (e.g. the Discogs token).
 *
 * AES-256-GCM with a key derived via HKDF-SHA256 from ENCRYPTION_KEY, or from
 * AUTH_SECRET when ENCRYPTION_KEY is unset. Rotating whichever secret is in use
 * makes previously stored values undecryptable; callers treat that as "not set".
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url parts).
 */

const VERSION = "v1";
const INFO = "33rpm:db-secrets:v1";

export function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "33rpm", INFO, 32));
}

export function encryptString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

/** Returns null if the value is malformed or was encrypted with a different key. */
export function decryptString(payload: string, key: Buffer): string | null {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [iv, tag, ct] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
