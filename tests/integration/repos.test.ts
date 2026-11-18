import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDatabase } from "@/db/client";
import { parseDatabaseUrl } from "@/db/dialect";
import { pingDatabase } from "@/db/repos/health";
import { getUserSettings, updateUserSettings } from "@/db/repos/settings";
import {
  CREDENTIAL_PROVIDER_ID,
  countUsers,
  createUserWithPassword,
  deleteSessionsForUser,
  findUserByEmail,
  setPassword,
} from "@/db/repos/users";
import { withTransaction } from "@/db/tx";
import { TEST_DIALECT, migratedDb, type TestDb } from "./db";

let db: TestDb;
beforeEach(async () => {
  db = await migratedDb();
});
afterEach(async () => {
  await db.cleanup();
});

async function makeUser(email = "admin@example.com") {
  return withTransaction(
    (tx) => createUserWithPassword(tx, db.t, { name: "Admin", email, passwordHash: "hash:1" }),
    db,
  );
}

describe(`repos (${TEST_DIALECT})`, () => {
  it("pings the database", async () => {
    await expect(pingDatabase(db)).resolves.toBeUndefined();
  });

  it("creates a user with a credential account and settings in one transaction", async () => {
    const id = await makeUser("Admin@Example.com ");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await countUsers(db)).toBe(1);
    const user = await findUserByEmail("admin@example.com", db);
    expect(user?.id).toBe(id);
    const accounts = await db.db.select().from(db.t.account).where(eq(db.t.account.userId, id));
    expect(accounts).toMatchObject([{ providerId: CREDENTIAL_PROVIDER_ID, password: "hash:1" }]);
    expect((await getUserSettings(id, db)).defaultCurrency).toBe("USD");
  });

  it("rolls back every row when the transaction fails", async () => {
    await makeUser();
    // Same email again violates the unique constraint after the first insert succeeds.
    await expect(makeUser()).rejects.toThrow();
    expect(await countUsers(db)).toBe(1);
    expect(await db.db.$count(db.t.account)).toBe(1);
  });

  it("sets a password, creating the credential account for SSO-only users", async () => {
    const id = await makeUser();
    expect(await setPassword(id, "hash:2", db)).toEqual({ created: false });
    await db.db.delete(db.t.account).where(eq(db.t.account.userId, id));
    expect(await setPassword(id, "hash:3", db)).toEqual({ created: true });
    const [acct] = await db.db.select().from(db.t.account).where(eq(db.t.account.userId, id));
    expect(acct.password).toBe("hash:3");
  });

  it("revokes all of a user's sessions", async () => {
    const id = await makeUser();
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.db.insert(db.t.session).values([
      { id: "s1", token: "t1", userId: id, expiresAt },
      { id: "s2", token: "t2", userId: id, expiresAt },
    ]);
    expect(await deleteSessionsForUser(id, db)).toBe(2);
    expect(await db.db.$count(db.t.session)).toBe(0);
  });

  it("creates settings lazily and updates them", async () => {
    const id = await makeUser();
    await updateUserSettings(id, { defaultCurrency: "EUR", theme: "light" }, db);
    expect(await getUserSettings(id, db)).toMatchObject({ defaultCurrency: "EUR", theme: "light" });
  });
});

describe(`read-only connections (${TEST_DIALECT})`, () => {
  it("can read but never write", async () => {
    await makeUser();
    const ro = openDatabase(parseDatabaseUrl(db.url), { readOnly: true });
    try {
      expect(await countUsers(ro)).toBe(1);
      const err = await ro.db
        .insert(ro.t.appState)
        .values({ key: "k", value: "v" })
        .then(
          () => null,
          (e: Error) => e,
        );
      // Drizzle wraps the driver error; the driver's message is in `cause`.
      const message = `${err?.message} ${(err?.cause as Error | undefined)?.message}`;
      expect(message).toMatch(/read.?only|readonly/i);
    } finally {
      await ro.close();
    }
  });
});
