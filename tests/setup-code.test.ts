import { describe, expect, it } from "vitest";

import { user } from "@/db/schema";
import type { Db } from "@/db";
import {
  consumeSetupCode,
  generateSetupCode,
  issueSetupCodeIfNeeded,
  normalizeSetupCode,
  verifySetupCode,
} from "@/lib/setup-code";
import { migratedDb } from "./helpers";

describe("setup code", () => {
  it("has the expected shape", () => {
    expect(generateSetupCode()).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    expect(normalizeSetupCode(" abcd-efgh ")).toBe("ABCDEFGH");
  });

  it("is issued on an empty instance, verified loosely, and consumed exactly once", () => {
    const db = migratedDb().db as unknown as Db;
    const code = issueSetupCodeIfNeeded(db)!;
    expect(code).toBeTruthy();
    expect(verifySetupCode(db, "WRONG-CODE")).toBe(false);
    expect(verifySetupCode(db, code.toLowerCase())).toBe(true);
    expect(consumeSetupCode(db, code)).toBe(true);
    expect(consumeSetupCode(db, code)).toBe(false);
  });

  it("rotates on restart: only the newest code works", () => {
    const db = migratedDb().db as unknown as Db;
    const first = issueSetupCodeIfNeeded(db)!;
    const second = issueSetupCodeIfNeeded(db)!;
    expect(verifySetupCode(db, first)).toBe(false);
    expect(verifySetupCode(db, second)).toBe(true);
  });

  it("is not issued, and any stale code is invalidated, once a user exists", () => {
    const db = migratedDb().db as unknown as Db;
    const code = issueSetupCodeIfNeeded(db)!;
    db.insert(user).values({ id: "u1", name: "A", email: "a@example.com" }).run();
    expect(issueSetupCodeIfNeeded(db)).toBeNull();
    expect(verifySetupCode(db, code)).toBe(false);
  });
});
