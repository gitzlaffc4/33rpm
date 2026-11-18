/**
 * Provider parsers against real recorded API responses (tests/fixtures/providers,
 * captured from musicbrainz.org and api.discogs.com; both datasets are CC0).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultSortName,
  looksLikeBarcode,
  normalizeBarcode,
  normalizeCatalogNumber,
  searchKey,
  stripDisambiguation,
  yearFrom,
} from "@/lib/catalog/normalize";
import { discogsFormat, mapDiscogsCandidate, mapDiscogsRelease } from "@/lib/providers/discogs";
import {
  mapMbCandidate,
  mapMbRelease,
  mbFormat,
  mbTextQuery,
  rankMbResults,
  type MbRelease,
} from "@/lib/providers/musicbrainz";

const fixture = (name: string) =>
  JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "../fixtures/providers", name), "utf8"),
  );

describe("normalize", () => {
  it("builds diacritic-free search keys", () => {
    expect(searchKey("  Björk & Sigur Rós! ")).toBe("bjork and sigur ros");
    expect(searchKey("Motörhead")).toBe("motorhead");
  });
  it("normalizes barcodes and catalog numbers", () => {
    expect(normalizeBarcode("0 7599-27313-2 4")).toBe("075992731324");
    expect(normalizeCatalogNumber("BSK-3010")).toBe("BSK3010");
    expect(looksLikeBarcode("0 7599-27313-2 4")).toBe(true);
    expect(looksLikeBarcode("IFPI L573")).toBe(false);
    expect(looksLikeBarcode("1234")).toBe(false);
  });
  it("handles names and years", () => {
    expect(stripDisambiguation("Pink Floyd (2)")).toBe("Pink Floyd");
    expect(defaultSortName("The Beatles")).toBe("Beatles, The");
    expect(yearFrom("1977-02-04")).toBe(1977);
    expect(yearFrom("")).toBeNull();
  });
});

describe("MusicBrainz", () => {
  it("maps barcode search results", () => {
    const [first] = fixture("mb-search-barcode.json").releases.map(mapMbCandidate);
    expect(first).toMatchObject({
      provider: "musicbrainz",
      // The disambiguation is kept: it's what tells otherwise identical pressings apart.
      title: "Rumours (with bilingual legal notice)",
      artist: "Fleetwood Mac",
      country: "CA",
      format: "cd",
      label: "Warner Bros. Records",
      catalogNumber: "CD 3010",
      barcodes: ["075992731324"],
    });
    expect(first.formatSummary).toBe("CD · Album");
    expect(first.thumbUrl).toMatch(
      /^https:\/\/coverartarchive\.org\/release-group\/.+\/front-250$/,
    );
  });

  it("maps a full release with tracklist and release group", () => {
    const r = mapMbRelease(fixture("mb-release.json"));
    expect(r.title).toBe("Rumours");
    expect(r.artists).toEqual([expect.objectContaining({ name: "Fleetwood Mac", joinPhrase: "" })]);
    expect(r.tracklist).toHaveLength(11);
    expect(r.tracklist[0]).toEqual({ position: "1", title: "Second Hand News", duration: "2:54" });
    expect(r.master).toMatchObject({ title: "Rumours", year: 1977 });
    // This release has no front image; fall back to the release group's cover.
    expect(r.coverUrl).toMatch(/\/release-group\/.+\/front-1200$/);
    expect(r.webUrl).toMatch(/^https:\/\/musicbrainz\.org\/release\//);
  });

  it("maps medium formats", () => {
    expect(mbFormat(['12" Vinyl'])).toBe("vinyl");
    expect(mbFormat(["CD", "CD"])).toBe("cd");
    expect(mbFormat(["Cassette"])).toBe("cassette");
    expect(mbFormat(["DVD-Audio"])).toBe("other");
    const formats = fixture("mb-search-text.json")
      .releases.map(mapMbCandidate)
      .map((c: { format: string }) => c.format);
    expect(formats).toContain("vinyl");
    expect(formats).toContain("cd");
  });

  it("builds text queries", () => {
    expect(mbTextQuery("Fleetwood Mac - Rumours")).toBe(
      'release:"Rumours" AND artist:"Fleetwood Mac"',
    );
    expect(mbTextQuery("fleetwood rumours")).toBe(
      "(release:fleetwood OR artist:fleetwood) AND (release:rumours OR artist:rumours)",
    );
    expect(mbTextQuery("AC/DC")).toContain("AC\\/DC");
  });

  it("re-ranks text results: the album first, tributes last, digital-only dropped", () => {
    const rel = (id: string, title: string, artist: string, format = '12" Vinyl'): MbRelease => ({
      id,
      title,
      "artist-credit": [{ name: artist, artist: { id: artist, name: artist } }],
      media: [{ format }],
    });
    const ranked = rankMbResults("Fleetwood Mac Rumours", [
      rel("tribute", "Plays Fleetwood Mac’s Rumours", "Royal Philharmonic Orchestra"),
      rel("self", "Fleetwood Mac", "Fleetwood Mac"),
      rel("digital", "Rumours", "Fleetwood Mac", "Digital Media"),
      rel("album", "Rumours", "Fleetwood Mac"),
    ]).map((r) => r.id);
    expect(ranked).toEqual(["album", "self", "tribute"]);
  });
});

describe("Discogs", () => {
  it("maps search results and keeps only real barcodes", () => {
    const [first] = fixture("discogs-search-barcode.json").results.map(mapDiscogsCandidate);
    expect(first).toMatchObject({
      provider: "discogs",
      artist: "Fleetwood Mac",
      title: "Rumours",
      format: "cd",
      catalogNumber: "3010-2",
      country: "US",
    });
    expect(first.barcodes).toEqual(["0 7599-27313-2 4", "075992731324"]);
  });

  it("maps a full release with its master", () => {
    const master = fixture("discogs-master.json");
    const r = mapDiscogsRelease(fixture("discogs-release.json"), {
      provider: "discogs",
      providerId: String(master.id),
      title: master.title,
      year: master.year,
      artists: [{ name: "Pink Floyd", joinPhrase: "" }],
      genres: master.genres,
      styles: master.styles,
    });
    expect(r).toMatchObject({
      title: "The Dark Side Of The Moon",
      format: "vinyl",
      country: "UK",
      year: 1973,
      label: "Harvest",
      catalogNumber: "SHVL 804",
    });
    expect(r.artists[0].name).toBe("Pink Floyd");
    expect(r.formatDetails).toEqual(
      expect.arrayContaining(["Vinyl", "LP", "Album", "Gatefold Sleeve, 1st Pressing"]),
    );
    expect(r.formatSummary).toBe("Vinyl · LP, Album, Stereo · Gatefold Sleeve, 1st Pressing");
    expect(r.tracklist[0]).toMatchObject({ position: "A1", title: "Speak To Me" });
    expect(r.coverUrl).toMatch(/^https:\/\/i\.discogs\.com\//);
    expect(r.master.title).toBe("The Dark Side Of The Moon");
  });

  it("maps format names", () => {
    expect(discogsFormat("Vinyl")).toBe("vinyl");
    expect(discogsFormat("CD")).toBe("cd");
    expect(discogsFormat("SACD")).toBe("cd");
    expect(discogsFormat("Cassette")).toBe("cassette");
    expect(discogsFormat("File")).toBe("other");
  });
});
