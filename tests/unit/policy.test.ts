import { describe, expect, it } from "vitest";

import { authErrorMessage } from "@/lib/auth-errors";
import { isEmailAllowed } from "@/lib/oidc-policy";
import { safeNextPath } from "@/lib/safe-redirect";

describe("isEmailAllowed", () => {
  it("allows everyone when the list is empty", () => {
    expect(isEmailAllowed("anyone@example.com", [])).toBe(true);
  });
  it("matches exact addresses and @domain entries, case-insensitively", () => {
    const list = ["me@example.com", "@family.example"];
    expect(isEmailAllowed("ME@example.com", list)).toBe(true);
    expect(isEmailAllowed("kid@family.example", list)).toBe(true);
    expect(isEmailAllowed("someone@evil.example", list)).toBe(false);
    expect(isEmailAllowed("x@notfamily.example.com", list)).toBe(false);
    expect(isEmailAllowed(undefined, list)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeNextPath("/settings?tab=1")).toBe("/settings?tab=1");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "", null])(
    "rejects %s",
    (v) => expect(safeNextPath(v)).toBe("/library"),
  );
});

describe("authErrorMessage", () => {
  it("maps known codes and sanitizes unknown ones", () => {
    expect(authErrorMessage("signup_disabled")).toMatch(/OIDC_AUTO_SIGNUP/);
    expect(authErrorMessage("<script>")).toBe("Sign-in failed (script).");
    expect(authErrorMessage(null)).toBeNull();
  });
});
