import { describe, expect, it } from "vitest";
import { z } from "zod";

import { normalizeEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it.each([
    "cgitzlaff@pm.me",
    " cgitzlaff@pm.me ",
    "cgitzlaff@pm.me ",
    "​cgitzlaff@pm.me",
    "CGitzlaff@PM.me﻿",
    "cgitzlaff@pm.me\t\n",
    "ｃgitzlaff@pm.me",
  ])("%j → valid, normalized", (input) => {
    const out = normalizeEmail(input);
    expect(out).toBe("cgitzlaff@pm.me");
    expect(z.email().safeParse(out).success).toBe(true);
  });
});
