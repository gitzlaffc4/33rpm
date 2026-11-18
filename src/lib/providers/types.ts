/**
 * Pluggable metadata providers (CLAUDE.md → Metadata providers). Implementations live
 * in this folder, isolated from UI; everything they return is validated with Zod.
 */
import type { Format, Track } from "@/lib/catalog/types";

export type ProviderName = "discogs" | "musicbrainz";

export type ArtistCredit = {
  name: string;
  /** Provider's artist id. */
  providerId?: string;
  sortName?: string;
  /** Text after this artist, e.g. " & ". */
  joinPhrase: string;
};

/** One row in a search result list. */
export type ReleaseCandidate = {
  provider: ProviderName;
  providerReleaseId: string;
  providerMasterId?: string;
  title: string;
  artist: string;
  year: number | null;
  country: string | null;
  format: Format;
  formatSummary: string;
  label: string | null;
  catalogNumber: string | null;
  barcodes: string[];
  /** Remote thumbnail (fetched through /api/images/remote). */
  thumbUrl: string | null;
};

export type ReleaseDetail = {
  provider: ProviderName;
  providerReleaseId: string;
  title: string;
  artists: ArtistCredit[];
  year: number | null;
  releaseDate: string | null;
  country: string | null;
  format: Format;
  formatDetails: string[];
  formatSummary: string;
  label: string | null;
  catalogNumber: string | null;
  barcodes: string[];
  tracklist: Track[];
  genres: string[];
  styles: string[];
  notes: string | null;
  coverUrl: string | null;
  master: {
    providerId: string | null;
    title: string;
    year: number | null;
    artists: ArtistCredit[];
  };
  /** Public page for attribution links. */
  webUrl: string;
};

export type MasterDetail = {
  provider: ProviderName;
  providerId: string;
  title: string;
  year: number | null;
  artists: ArtistCredit[];
  genres: string[];
  styles: string[];
};

export type SearchOptions = { format?: Format };

export interface MetadataProvider {
  readonly name: ProviderName;
  searchByBarcode(code: string): Promise<ReleaseCandidate[]>;
  searchByCatalogNumber(catno: string): Promise<ReleaseCandidate[]>;
  searchByText(query: string, opts?: SearchOptions): Promise<ReleaseCandidate[]>;
  getRelease(id: string): Promise<ReleaseDetail>;
  getMaster?(id: string): Promise<MasterDetail>;
}

export function artistDisplay(credits: ArtistCredit[]): string {
  return credits
    .map((c, i) => c.name + (i < credits.length - 1 ? c.joinPhrase || ", " : ""))
    .join("")
    .trim();
}
