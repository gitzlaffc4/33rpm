import { describe, expect, it } from "vitest";

import { barcodeVariants } from "@/lib/catalog/normalize";
import { classifyCandidates } from "@/lib/catalog/scan-lookup";
import type { ReleaseCandidate } from "@/lib/providers/types";

const c = (provider: ReleaseCandidate["provider"], id: string): ReleaseCandidate => ({
  provider,
  providerReleaseId: id,
  title: "T",
  artist: "A",
  year: null,
  country: null,
  format: "cd",
  formatSummary: "CD",
  label: null,
  catalogNumber: null,
  barcodes: [],
  thumbUrl: null,
});

describe("barcode variants", () => {
  it("treats UPC-A and its EAN-13 form as the same code", () => {
    expect(barcodeVariants("0 75992-73132 4")).toEqual(["075992731324", "0075992731324"]);
    expect(barcodeVariants("0075992731324")).toEqual(["0075992731324", "075992731324"]);
    expect(barcodeVariants("5099902894225")).toEqual(["5099902894225"]);
    expect(barcodeVariants("abc")).toEqual([]);
  });
});

describe("scan classification", () => {
  it("matches a single hit from the first provider, even if another provider has it too", () => {
    expect(classifyCandidates([c("discogs", "1"), c("musicbrainz", "x")])).toBe("matched");
  });
  it("flags several pressings sharing a barcode as ambiguous", () => {
    expect(classifyCandidates([c("musicbrainz", "x"), c("musicbrainz", "y")])).toBe("ambiguous");
  });
  it("reports nothing found", () => {
    expect(classifyCandidates([])).toBe("not_found");
  });
});
