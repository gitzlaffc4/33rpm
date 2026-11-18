import { describe, expect, it } from "vitest";

import {
  guessMapping,
  normalizeCondition,
  normalizeDate,
  normalizeFormat,
  normalizeRating,
  normalizeYear,
} from "@/lib/catalog/csv-mapping";

describe("CSV mapping", () => {
  it("guesses columns from common export headers", () => {
    expect(
      guessMapping([
        "Artist",
        "Title",
        "Format",
        "Cat. Number",
        "UPC",
        "Release Year",
        "Purchase Price",
        "Storage Device",
        "Condition",
      ]),
    ).toEqual({
      artist: 0,
      title: 1,
      format: 2,
      catalogNumber: 3,
      barcode: 4,
      year: 5,
      price: 6,
      location: 7,
      mediaCondition: 8,
    });
  });
  it("normalizes values", () => {
    expect(normalizeFormat('Vinyl, LP, 12"')).toBe("vinyl");
    expect(normalizeFormat("Audio CD")).toBe("cd");
    expect(normalizeFormat("Cassette")).toBe("cassette");
    expect(normalizeCondition("Near Mint (NM or M-)")).toBe("NM");
    expect(normalizeCondition("Very Good Plus (VG+)")).toBe("VG+");
    expect(normalizeCondition("vg")).toBe("VG");
    expect(normalizeCondition("Excellent")).toBe("VG+");
    expect(normalizeCondition("shiny")).toBeNull();
    expect(normalizeDate("2021-3-7")).toBe("2021-03-07");
    expect(normalizeDate("25/12/2020")).toBe("2020-12-25");
    expect(normalizeDate("")).toBeNull();
    expect(normalizeYear("1977-02-04")).toBe(1977);
    expect(normalizeRating("8")).toBe(4);
    expect(normalizeRating("3")).toBe(3);
  });
});
