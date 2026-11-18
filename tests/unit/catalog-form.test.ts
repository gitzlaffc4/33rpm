import { describe, expect, it } from "vitest";

import { parseCopyForm } from "@/lib/catalog/copy-form";
import { formatPrice, parsePrice, priceInputValue } from "@/lib/catalog/format";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("prices", () => {
  it("parses to integer minor units per currency", () => {
    expect(parsePrice("24.99", "USD")).toBe(2499);
    expect(parsePrice("24,99", "EUR")).toBe(2499);
    expect(parsePrice("$1,024.50", "USD")).toBe(102450);
    expect(parsePrice("3000", "JPY")).toBe(3000);
    expect(parsePrice("", "USD")).toBeNull();
    expect(parsePrice("abc", "USD")).toBeNull();
    expect(parsePrice("1.2.3", "USD")).toBeNaN();
  });
  it("formats and round-trips", () => {
    expect(formatPrice(2499, "USD", "en-US")).toBe("$24.99");
    expect(formatPrice(null, "USD")).toBe("");
    expect(priceInputValue(2499, "USD")).toBe("24.99");
    expect(priceInputValue(3000, "JPY")).toBe("3000");
  });
});

describe("copy form", () => {
  it("normalizes blanks to null and splits tags", () => {
    const r = parseCopyForm(
      fd({
        mediaCondition: "VG+",
        sleeveCondition: "",
        price: "12.50",
        currency: "USD",
        tags: "OG, gift ,",
        rating: "",
      }),
    );
    expect(r.ok && r.data).toMatchObject({
      mediaCondition: "VG+",
      sleeveCondition: null,
      priceMinor: 1250,
      tags: ["OG", "gift"],
      rating: null,
      acquiredOn: null,
    });
  });
  it("rejects bad conditions and prices", () => {
    expect(parseCopyForm(fd({ mediaCondition: "Great", currency: "USD" })).ok).toBe(false);
    const r = parseCopyForm(fd({ price: "1.2.3", currency: "USD" }));
    expect(!r.ok && r.field).toBe("price");
  });
});
