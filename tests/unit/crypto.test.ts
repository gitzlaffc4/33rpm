import { describe, expect, it } from "vitest";

import { decryptString, deriveKey, encryptString } from "@/lib/crypto";

describe("secret encryption", () => {
  const key = deriveKey("a".repeat(32));

  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptString("my-discogs-token", key);
    const b = encryptString("my-discogs-token", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptString(a, key)).toBe("my-discogs-token");
  });

  it("returns null with the wrong key (e.g. rotated secret)", () => {
    const ct = encryptString("token", key);
    expect(decryptString(ct, deriveKey("b".repeat(32)))).toBeNull();
  });

  it("returns null for tampered or malformed payloads", () => {
    const ct = encryptString("token", key);
    const parts = ct.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(decryptString(parts.join("."), key)).toBeNull();
    expect(decryptString("garbage", key)).toBeNull();
  });
});
