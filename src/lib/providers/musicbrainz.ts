/**
 * MusicBrainz provider (no token needed) + Cover Art Archive covers.
 * https://musicbrainz.org/doc/MusicBrainz_API — max 1 request/second, descriptive UA.
 * MusicBrainz core data is CC0.
 */
import { z } from "zod";

import { searchKey, yearFrom } from "@/lib/catalog/normalize";
import type { Format, Track } from "@/lib/catalog/types";
import { fetchJson } from "./http";
import type {
  ArtistCredit,
  MetadataProvider,
  ReleaseCandidate,
  ReleaseDetail,
  SearchOptions,
} from "./types";
import { artistDisplay } from "./types";

const API = "https://musicbrainz.org/ws/2";
const CAA = "https://coverartarchive.org";

const ArtistCreditSchema = z.array(
  z.object({
    name: z.string(),
    joinphrase: z.string().optional(),
    artist: z.object({ id: z.string(), name: z.string(), "sort-name": z.string().optional() }),
  }),
);

const MediaSchema = z.object({
  format: z.string().nullish(),
  "track-count": z.number().optional(),
  position: z.number().optional(),
  tracks: z
    .array(
      z.object({
        number: z.string().nullish(),
        position: z.number().optional(),
        title: z.string(),
        length: z.number().nullish(),
      }),
    )
    .optional(),
});

const ReleaseGroupSchema = z.object({
  id: z.string(),
  title: z.string(),
  "primary-type": z.string().nullish(),
  "secondary-types": z.array(z.string()).optional(),
  "first-release-date": z.string().optional(),
  "artist-credit": ArtistCreditSchema.optional(),
  genres: z.array(z.object({ name: z.string(), count: z.number().optional() })).optional(),
});

const ReleaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string().nullish(),
  country: z.string().nullish(),
  barcode: z.string().nullish(),
  disambiguation: z.string().nullish(),
  "artist-credit": ArtistCreditSchema.optional(),
  "release-group": ReleaseGroupSchema.optional(),
  "label-info": z
    .array(
      z.object({
        "catalog-number": z.string().nullish(),
        label: z.object({ name: z.string() }).nullish(),
      }),
    )
    .optional(),
  media: z.array(MediaSchema).optional(),
  genres: z.array(z.object({ name: z.string(), count: z.number().optional() })).optional(),
  "cover-art-archive": z.object({ front: z.boolean() }).optional(),
});

const SearchSchema = z.object({ releases: z.array(ReleaseSchema) });

export type MbRelease = z.infer<typeof ReleaseSchema>;

/** MusicBrainz medium formats → our formats. */
export function mbFormat(formats: (string | null | undefined)[]): Format {
  const f = formats.filter(Boolean).join(" ").toLowerCase();
  if (/vinyl|\blp\b|7"|10"|12"|flexi/.test(f)) return "vinyl";
  if (/cassette|tape/.test(f)) return "cassette";
  if (/\bcd\b|sacd|hdcd|cd-r|shm-cd|blu-spec/.test(f)) return "cd";
  return "other";
}

function credits(ac: z.infer<typeof ArtistCreditSchema> | undefined): ArtistCredit[] {
  return (ac ?? []).map((c) => ({
    name: c.name,
    providerId: c.artist.id,
    sortName: c.artist["sort-name"],
    joinPhrase: c.joinphrase ?? "",
  }));
}

/** e.g. "2×12\" Vinyl · Album, Compilation" */
function formatParts(r: MbRelease): { details: string[]; summary: string } {
  const counts = new Map<string, number>();
  for (const m of r.media ?? []) {
    const name = m.format ?? "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const media = [...counts].map(([name, n]) => (n > 1 ? `${n}×${name}` : name));
  const types = [
    r["release-group"]?.["primary-type"],
    ...(r["release-group"]?.["secondary-types"] ?? []),
  ].filter((t): t is string => Boolean(t));
  const details = [...media, ...types];
  return {
    details,
    summary: [media.join(" + ") || "Unknown", types.join(", ")].filter(Boolean).join(" · "),
  };
}

function msToDuration(ms: number | null | undefined): string | undefined {
  if (!ms) return undefined;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function mapMbCandidate(r: MbRelease): ReleaseCandidate {
  const formats = (r.media ?? []).map((m) => m.format);
  const label = r["label-info"]?.find((l) => l.label?.name);
  const rg = r["release-group"];
  return {
    provider: "musicbrainz",
    providerReleaseId: r.id,
    providerMasterId: rg?.id,
    title: r.title + (r.disambiguation ? ` (${r.disambiguation})` : ""),
    artist: artistDisplay(credits(r["artist-credit"])),
    year: yearFrom(r.date),
    country: r.country ?? null,
    format: mbFormat(formats),
    formatSummary: formatParts(r).summary,
    label: label?.label?.name ?? null,
    catalogNumber: r["label-info"]?.find((l) => l["catalog-number"])?.["catalog-number"] ?? null,
    barcodes: r.barcode ? [r.barcode] : [],
    // Search results don't say whether a release has a front cover; the release
    // group's front image is the best bet for a thumbnail.
    thumbUrl: rg ? `${CAA}/release-group/${rg.id}/front-250` : null,
  };
}

export function mapMbRelease(r: MbRelease): ReleaseDetail {
  const rg = r["release-group"];
  const artists = credits(r["artist-credit"]);
  const { details, summary } = formatParts(r);
  const multiDisc = (r.media?.length ?? 0) > 1;
  const tracklist: Track[] = (r.media ?? []).flatMap((m, i) =>
    (m.tracks ?? []).map((t) => ({
      position: multiDisc
        ? `${m.position ?? i + 1}-${t.number ?? t.position}`
        : String(t.number ?? t.position ?? ""),
      title: t.title,
      duration: msToDuration(t.length),
    })),
  );
  const label = r["label-info"]?.find((l) => l.label?.name);
  const genres = (r.genres?.length ? r.genres : (rg?.genres ?? []))
    .slice()
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 5)
    .map((g) => g.name.replace(/\b\w/g, (c) => c.toUpperCase()));
  const front = r["cover-art-archive"]?.front;
  return {
    provider: "musicbrainz",
    providerReleaseId: r.id,
    title: r.title,
    artists,
    year: yearFrom(r.date),
    releaseDate: r.date || null,
    country: r.country ?? null,
    format: mbFormat((r.media ?? []).map((m) => m.format)),
    formatDetails: details,
    formatSummary: summary,
    label: label?.label?.name ?? null,
    catalogNumber: r["label-info"]?.find((l) => l["catalog-number"])?.["catalog-number"] ?? null,
    barcodes: r.barcode ? [r.barcode] : [],
    tracklist,
    genres,
    styles: [],
    notes: r.disambiguation || null,
    coverUrl: front
      ? `${CAA}/release/${r.id}/front-1200`
      : rg
        ? `${CAA}/release-group/${rg.id}/front-1200`
        : null,
    master: {
      providerId: rg?.id ?? null,
      title: rg?.title ?? r.title,
      year: yearFrom(rg?.["first-release-date"]) ?? yearFrom(r.date),
      artists: rg?.["artist-credit"] ? credits(rg["artist-credit"]) : artists,
    },
    webUrl: `https://musicbrainz.org/release/${r.id}`,
  };
}

/** Escape Lucene special characters for a MusicBrainz query term. */
export function luceneEscape(term: string): string {
  return term.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");
}

/**
 * "Artist - Title" → `release:"Title" AND artist:"Artist"`. Otherwise every word must
 * appear in the title or the artist name (so "Fleetwood Mac Rumours" finds Rumours rather
 * than 50 pressings of the self-titled album); `rankMbResults` then orders the hits.
 */
export function mbTextQuery(input: string): string {
  const q = input.trim();
  const split = /^(.+?)\s+[-–—]\s+(.+)$/.exec(q);
  if (split) {
    return `release:"${luceneEscape(split[2])}" AND artist:"${luceneEscape(split[1])}"`;
  }
  return q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .map((w) => luceneEscape(w))
    .map((w) => `(release:${w} OR artist:${w})`)
    .join(" AND ");
}

/** Fallback when the strict query finds nothing (typos, partial words). */
export function mbLooseQuery(input: string): string {
  const words = luceneEscape(input.trim());
  return `release:(${words}) OR artist:(${words})`;
}

const tokens = (s: string) => new Set(searchKey(s).split(" ").filter(Boolean));

/** Physical releases only: a collection app has no use for digital-only releases. */
function isPhysical(r: MbRelease) {
  const formats = (r.media ?? []).map((m) => m.format ?? "");
  return formats.length === 0 || formats.some((f) => f !== "Digital Media");
}

/**
 * Re-rank by how well title + artist account for the query words, penalizing extra
 * title words ("Plays …", "A Tribute to …"). Stable, so MusicBrainz's order breaks ties.
 */
export function rankMbResults(query: string, releases: MbRelease[]): MbRelease[] {
  const q = tokens(query);
  if (!q.size) return releases;
  const score = (r: MbRelease) => {
    const title = tokens(r.title);
    const artist = tokens(
      (r["artist-credit"] ?? []).map((c) => c.name + (c.joinphrase ?? "")).join(""),
    );
    let covered = 0;
    for (const w of q) if (title.has(w) || artist.has(w)) covered++;
    const titleExtra = [...title].filter((w) => !q.has(w)).length / Math.max(title.size, 1);
    const artistExtra = [...artist].filter((w) => !q.has(w)).length / Math.max(artist.size, 1);
    return (2 * covered) / q.size - titleExtra - 0.3 * artistExtra;
  };
  return releases
    .filter(isPhysical)
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.r);
}

export function createMusicBrainzProvider(): MetadataProvider {
  const fetchReleases = async (query: string, limit = 25) => {
    const url = `${API}/release/?fmt=json&limit=${limit}&query=${encodeURIComponent(query)}`;
    return (await fetchJson(url, { provider: "musicbrainz", schema: SearchSchema })).releases;
  };
  const search = async (query: string) =>
    (await fetchReleases(query)).filter(isPhysical).map(mapMbCandidate);
  return {
    name: "musicbrainz",
    searchByBarcode: (code) => search(`barcode:${code.replace(/\D/g, "")}`),
    searchByCatalogNumber: (catno) => search(`catno:"${luceneEscape(catno.trim())}"`),
    async searchByText(query: string, opts?: SearchOptions) {
      const ranked = rankMbResults(query, await fetchReleases(mbTextQuery(query), 60)).map(
        mapMbCandidate,
      );
      return (opts?.format ? ranked.filter((r) => r.format === opts.format) : ranked).slice(0, 25);
    },
    async getRelease(id: string) {
      const inc = "artist-credits+labels+recordings+release-groups+media+genres";
      const url = `${API}/release/${encodeURIComponent(id)}?fmt=json&inc=${inc}`;
      return mapMbRelease(await fetchJson(url, { provider: "musicbrainz", schema: ReleaseSchema }));
    },
  };
}
