import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUserWithPassword } from "@/db/repos/users";
import { withTransaction } from "@/db/tx";
import {
  consumeSetupCode,
  generateSetupCode,
  issueSetupCodeIfNeeded,
  normalizeSetupCode,
  verifySetupCode,
} from "@/lib/setup-code";
import { TEST_DIALECT, migratedDb, type TestDb } from "./db";

let db: TestDb;
beforeEach(async () => {
  db = await migratedDb();
});
afterEach(async () => {
  await db.cleanup();
});

describe(`setup code (${TEST_DIALECT})`, () => {
  it("has the expected shape", () => {
    expect(generateSetupCode()).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(normalizeSetupCode(" abcd-efgh ")).toBe("ABCDEFGH");
  });

  it("is issued on an empty instance, verified loosely, and consumed exactly once", async () => {
    const code = (await issueSetupCodeIfNeeded(db))!;
    expect(code).toBeTruthy();
    expect(await verifySetupCode("WRONG-CODE", db)).toBe(false);
    expect(await verifySetupCode(code.toLowerCase(), db)).toBe(true);
    expect(await consumeSetupCode(code, db)).toBe(true);
    expect(await consumeSetupCode(code, db)).toBe(false);
  });

  it("can be consumed by only one of several concurrent attempts", async () => {
    const code = (await issueSetupCodeIfNeeded(db))!;
    const results = await Promise.all([1, 2, 3, 4].map(() => consumeSetupCode(code, db)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rotates on restart: only the newest code works", async () => {
    const first = (await issueSetupCodeIfNeeded(db))!;
    const second = (await issueSetupCodeIfNeeded(db))!;
    expect(await verifySetupCode(first, db)).toBe(false);
    expect(await verifySetupCode(second, db)).toBe(true);
  });

  it("is not issued, and any stale code is invalidated, once a user exists", async () => {
    const code = (await issueSetupCodeIfNeeded(db))!;
    await withTransaction(
      (tx) =>
        createUserWithPassword(tx, db.t, { name: "A", email: "a@example.com", passwordHash: "x" }),
      db,
    );
    expect(await issueSetupCodeIfNeeded(db)).toBeNull();
    expect(await verifySetupCode(code, db)).toBe(false);
  });
});
