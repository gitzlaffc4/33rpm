import "server-only";

import { getEnv } from "@/env";
import { decryptSecret } from "@/lib/secrets";
import { getUserSettings } from "@/db/repos/settings";

export type DiscogsTokenStatus =
  | { source: "settings"; hint: string | null }
  | { source: "env" }
  | { source: "undecryptable" }
  | { source: "none" };

/**
 * Resolve the Discogs token for a user: the one saved in Settings wins, then the
 * DISCOGS_TOKEN env var. Server-only; the plaintext never reaches the client.
 */
export async function resolveDiscogsToken(userId: string): Promise<string | null> {
  const s = await getUserSettings(userId);
  if (s.discogsTokenEncrypted) {
    const token = decryptSecret(s.discogsTokenEncrypted);
    if (token) return token;
  }
  return getEnv().DISCOGS_TOKEN ?? null;
}

export async function discogsTokenStatus(userId: string): Promise<DiscogsTokenStatus> {
  const s = await getUserSettings(userId);
  if (s.discogsTokenEncrypted) {
    return decryptSecret(s.discogsTokenEncrypted)
      ? { source: "settings", hint: s.discogsTokenHint }
      : { source: "undecryptable" };
  }
  return getEnv().DISCOGS_TOKEN ? { source: "env" } : { source: "none" };
}
