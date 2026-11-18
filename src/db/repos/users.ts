/** Users, credential accounts and sessions (rows Better Auth also manages). */
import { and, eq } from "drizzle-orm";

import { getDb, type Db, type DbHandle } from "@/db";
import { newId } from "@/db/ids";
import { exclusive } from "@/db/tx";

/** Better Auth's provider id for email/password accounts. */
export const CREDENTIAL_PROVIDER_ID = "credential";

export async function countUsers(h: DbHandle = getDb()): Promise<number> {
  return h.db.$count(h.t.user);
}

export async function findUserByEmail(email: string, h: DbHandle = getDb()) {
  const rows = await h.db
    .select()
    .from(h.t.user)
    .where(eq(h.t.user.email, email.trim().toLowerCase()));
  return rows[0] ?? null;
}

/**
 * Create a user with a password account and a settings row. Call inside
 * `withTransaction` so all three rows land together. `passwordHash` must come
 * from Better Auth's hasher.
 */
export async function createUserWithPassword(
  tx: Db,
  t: DbHandle["t"],
  input: { name: string; email: string; passwordHash: string; emailVerified?: boolean },
): Promise<string> {
  const userId = newId();
  const now = new Date();
  await tx.insert(t.user).values({
    id: userId,
    name: input.name,
    email: input.email.trim().toLowerCase(),
    emailVerified: input.emailVerified ?? false,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(t.account).values({
    id: newId(),
    userId,
    providerId: CREDENTIAL_PROVIDER_ID,
    accountId: userId,
    password: input.passwordHash,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(t.userSettings).values({ userId, updatedAt: now });
  return userId;
}

/**
 * Set a user's password, creating the credential account if they only had SSO.
 * Returns whether an account was created.
 */
export async function setPassword(
  userId: string,
  passwordHash: string,
  h: DbHandle = getDb(),
): Promise<{ created: boolean }> {
  return exclusive(async () => {
    const now = new Date();
    const updated = await h.db
      .update(h.t.account)
      .set({ password: passwordHash, updatedAt: now })
      .where(
        and(eq(h.t.account.userId, userId), eq(h.t.account.providerId, CREDENTIAL_PROVIDER_ID)),
      )
      .returning({ id: h.t.account.id });
    if (updated.length) return { created: false };
    await h.db.insert(h.t.account).values({
      id: newId(),
      userId,
      providerId: CREDENTIAL_PROVIDER_ID,
      accountId: userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true };
  }, h);
}

/** Revoke every session of a user. Returns how many were removed. */
export async function deleteSessionsForUser(userId: string, h: DbHandle = getDb()) {
  return exclusive(async () => {
    const deleted = await h.db
      .delete(h.t.session)
      .where(eq(h.t.session.userId, userId))
      .returning({ id: h.t.session.id });
    return deleted.length;
  }, h);
}
