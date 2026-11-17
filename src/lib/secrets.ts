import "server-only";

import { getEnv } from "@/env";
import { decryptString, deriveKey, encryptString } from "@/lib/crypto";

let key: Buffer | undefined;

function appKey() {
  const env = getEnv();
  key ??= deriveKey(env.ENCRYPTION_KEY ?? env.AUTH_SECRET);
  return key;
}

export const encryptSecret = (plaintext: string) => encryptString(plaintext, appKey());
export const decryptSecret = (payload: string) => decryptString(payload, appKey());
