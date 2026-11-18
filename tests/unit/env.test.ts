import path from "node:path";

import { describe, expect, it } from "vitest";

import { EnvError, parseEnv, sqliteFileFromUrl } from "@/env";

const base = {
  APP_URL: "https://music.example.com/",
  AUTH_SECRET: "x".repeat(32),
  DATA_DIR: "/data",
};

describe("parseEnv", () => {
  it("applies defaults and derives paths", () => {
    const env = parseEnv(base);
    expect(env.APP_URL).toBe("https://music.example.com");
    expect(env.DATABASE_URL).toBe("file:/data/33rpm.db");
    expect(env.DATABASE_PATH).toBe("/data/33rpm.db");
    expect(env.DATABASE_DIALECT).toBe("sqlite");
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.IMAGES_DIR).toBe("/data/images");
    expect(env.BACKUPS_DIR).toBe("/data/backups");
    expect(env.AUTH_LOCAL_LOGIN).toBe(true);
    expect(env.OIDC_ENABLED).toBe(false);
    expect(env.OIDC_AUTO_SIGNUP).toBe(false);
    expect(env.OIDC_SCOPES).toEqual(["openid", "profile", "email"]);
    expect(env.IP_ADDRESS_HEADERS).toEqual(["x-forwarded-for"]);
    expect(env.SECURE_COOKIES).toBe(true);
  });

  it("uses an explicit DATABASE_URL", () => {
    expect(parseEnv({ ...base, DATABASE_URL: "file:/srv/music.db" }).DATABASE_PATH).toBe(
      "/srv/music.db",
    );
  });

  it("accepts PostgreSQL URLs and rejects unknown schemes", () => {
    const env = parseEnv({
      ...base,
      DATABASE_URL: "postgres://u:p@db:5432/x",
      DATABASE_SSL: "require",
      DATABASE_POOL_MAX: "4",
    });
    expect(env.DATABASE_DIALECT).toBe("pg");
    expect(env.DATABASE_PATH).toBeNull();
    expect(env.DATABASE_SSL).toBe("require");
    expect(env.DATABASE_POOL_MAX).toBe(4);
    expect(parseEnv({ ...base, DATABASE_URL: "postgresql://db/x" }).DATABASE_DIALECT).toBe("pg");
    expect(() => parseEnv({ ...base, DATABASE_URL: "mysql://db/x" })).toThrow(/file:/);
    expect(() => parseEnv({ ...base, DATABASE_SSL: "maybe" })).toThrow(/DATABASE_SSL/);
    expect(() => parseEnv({ ...base, DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/);
  });

  it("requires a long AUTH_SECRET and a valid APP_URL", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(EnvError);
    expect(() => parseEnv({ ...base, APP_URL: "music.local" })).toThrow(/APP_URL/);
  });

  it("validates ENCRYPTION_KEY length when set", () => {
    expect(() => parseEnv({ ...base, ENCRYPTION_KEY: "short" })).toThrow(/ENCRYPTION_KEY/);
    expect(parseEnv({ ...base, ENCRYPTION_KEY: "" }).ENCRYPTION_KEY).toBeUndefined();
  });

  it("requires OIDC settings all-or-none", () => {
    expect(() => parseEnv({ ...base, OIDC_ISSUER: "https://id.example.com" })).toThrow(/OIDC/);
    const env = parseEnv({
      ...base,
      OIDC_ISSUER: "https://id.example.com",
      OIDC_CLIENT_ID: "33rpm",
      OIDC_CLIENT_SECRET: "s3cret",
      OIDC_ALLOWED_EMAILS: "Me@Example.com, @family.example",
      OIDC_AUTO_SIGNUP: "yes",
    });
    expect(env.OIDC_ENABLED).toBe(true);
    expect(env.OIDC_AUTO_SIGNUP).toBe(true);
    expect(env.OIDC_ALLOWED_EMAILS).toEqual(["me@example.com", "@family.example"]);
  });

  it("refuses AUTH_LOCAL_LOGIN=false without OIDC", () => {
    expect(() => parseEnv({ ...base, AUTH_LOCAL_LOGIN: "false" })).toThrow(/AUTH_LOCAL_LOGIN/);
  });

  it("rejects malformed booleans and proxies", () => {
    expect(() => parseEnv({ ...base, OIDC_AUTO_SIGNUP: "maybe" })).toThrow(/true\/false/);
    expect(() => parseEnv({ ...base, TRUSTED_PROXIES: "not-an-ip" })).toThrow(/TRUSTED_PROXIES/);
    expect(parseEnv({ ...base, TRUSTED_PROXIES: "172.18.0.0/16, ::1" }).TRUSTED_PROXIES).toEqual([
      "172.18.0.0/16",
      "::1",
    ]);
  });

  it("marks cookies insecure for http APP_URL", () => {
    expect(parseEnv({ ...base, APP_URL: "http://pi.local:3000" }).SECURE_COOKIES).toBe(false);
  });
});

describe("sqliteFileFromUrl", () => {
  it.each([
    ["file:/data/a.db", "/data/a.db"],
    ["file:///data/a.db", "/data/a.db"],
    ["file:./data/a.db", path.resolve("./data/a.db")],
  ])("%s → %s", (url, expected) => expect(sqliteFileFromUrl(url)).toBe(expected));

  it("returns null for other schemes", () => {
    expect(sqliteFileFromUrl("postgres://x")).toBeNull();
    expect(sqliteFileFromUrl("file:")).toBeNull();
  });
});
