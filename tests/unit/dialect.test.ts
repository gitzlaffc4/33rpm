import { describe, expect, it } from "vitest";

import { DatabaseUrlError, parseDatabaseUrl, redactDatabaseUrl } from "@/db/dialect";
import { uuidv7 } from "@/db/ids";

describe("parseDatabaseUrl", () => {
  it("detects SQLite file URLs", () => {
    expect(parseDatabaseUrl("file:/data/33rpm.db")).toEqual({
      dialect: "sqlite",
      url: "file:/data/33rpm.db",
      path: "/data/33rpm.db",
    });
  });
  it("detects PostgreSQL URLs", () => {
    expect(parseDatabaseUrl("postgres://u:p@db:5432/x").dialect).toBe("pg");
    expect(parseDatabaseUrl("postgresql://db/x").dialect).toBe("pg");
  });
  it.each(["mysql://db/x", "", "file:", "postgres://"])("rejects %j", (url) => {
    expect(() => parseDatabaseUrl(url)).toThrow(DatabaseUrlError);
  });
});

describe("redactDatabaseUrl", () => {
  it("never leaks credentials", () => {
    const out = redactDatabaseUrl("postgres://33rpm:s3cret@db:5432/33rpm");
    expect(out).not.toContain("s3cret");
    expect(out).not.toContain("33rpm:");
    expect(out).toContain("db:5432/33rpm");
  });
  it("leaves file URLs alone", () => {
    expect(redactDatabaseUrl("file:/data/33rpm.db")).toBe("file:/data/33rpm.db");
  });
});

describe("uuidv7", () => {
  it("is a valid v7 UUID", () => {
    expect(uuidv7()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it("sorts by creation time", () => {
    const ids = [1, 2, 3].map((n) => uuidv7(1_800_000_000_000 + n * 1000));
    expect([...ids].sort()).toEqual(ids);
  });
  it("encodes the timestamp in the first 48 bits", () => {
    const ms = 1_800_000_000_123;
    const hex = uuidv7(ms).replace(/-/g, "").slice(0, 12);
    expect(parseInt(hex, 16)).toBe(ms);
  });
});
