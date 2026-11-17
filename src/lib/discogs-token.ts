import "server-only";

import { getEnv } from "@/env";
import { decryptSecret } from "@/lib/secrets";
import { getUserSettings } from "@/lib/user-settings";

export type DiscogsTokenStatus =
  | { source: "settings"; hint: string | null }
  | { source: "env" }
  | { source: "undecryptable" }
  | { source: "none" };

/**
 * Resolve the Discogs token for a user: the one saved in Settings wins, then the
 * DISCOGS_TOKEN env var. Server-only; the plaintext never reaches the client.
 */
export function resolveDiscogsToken(userId: string): string | null {
  const s = getUserSettings(userId);
  if (s.discogsTokenEncrypted) {
    const token = decryptSecret(s.discogsTokenEncrypted);
    if (token) return token;
  }
  return getEnv().DISCOGS_TOKEN ?? null;
}

export function discogsTokenStatus(userId: string): DiscogsTokenStatus {
  const s = getUserSettings(userId);
  if (s.discogsTokenEncrypted) {
    return decryptSecret(s.discogsTokenEncrypted)
      ? { source: "settings", hint: s.discogsTokenHint }
      : { source: "undecryptable" };
  }
  return getEnv().DISCOGS_TOKEN ? { source: "env" } : { source: "none" };
}
