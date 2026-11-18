import "server-only";

import { getCached, putCached } from "@/db/repos/provider-cache";
import { normalizeBarcode, normalizeCatalogNumber, searchKey } from "@/lib/catalog/normalize";
import { resolveDiscogsToken } from "@/lib/discogs-token";
import { createDiscogsProvider } from "./discogs";
import { ProviderError } from "./http";
import { createMusicBrainzProvider } from "./musicbrainz";
import type {
  MetadataProvider,
  ProviderName,
  ReleaseCandidate,
  ReleaseDetail,
  SearchOptions,
} from "./types";

export type SearchMode = "text" | "barcode" | "catno";

const SEARCH_TTL = 24 * 60 * 60 * 1000;
const FOREVER = Number.POSITIVE_INFINITY;

/** Providers available to a user: Discogs first when they have a token, then MusicBrainz. */
export async function providersFor(userId: string): Promise<MetadataProvider[]> {
  const token = await resolveDiscogsToken(userId);
  return [...(token ? [createDiscogsProvider(token)] : []), createMusicBrainzProvider()];
}

export async function providerByName(
  userId: string,
  name: ProviderName,
): Promise<MetadataProvider> {
  if (name === "musicbrainz") return createMusicBrainzProvider();
  const token = await resolveDiscogsToken(userId);
  if (!token) throw new ProviderError("discogs", "no Discogs token configured");
  return createDiscogsProvider(token);
}

async function cached<T>(
  provider: string,
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = await getCached<T>(provider, key, ttl);
  if (hit !== null) return hit;
  const value = await fn();
  await putCached(provider, key, value);
  return value;
}

export type SearchResult = {
  results: ReleaseCandidate[];
  errors: { provider: ProviderName; message: string }[];
};

/** Search every available provider in parallel; one failing provider doesn't fail the search. */
export async function searchCatalog(
  userId: string,
  mode: SearchMode,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const providers = await providersFor(userId);
  const norm =
    mode === "barcode"
      ? normalizeBarcode(query)
      : mode === "catno"
        ? normalizeCatalogNumber(query)
        : searchKey(query);
  const settled = await Promise.allSettled(
    providers.map((p) =>
      cached(p.name, `search:${mode}:${norm}:${opts.format ?? ""}`, SEARCH_TTL, () =>
        mode === "barcode"
          ? p.searchByBarcode(query)
          : mode === "catno"
            ? p.searchByCatalogNumber(query)
            : p.searchByText(query, opts),
      ),
    ),
  );
  const result: SearchResult = { results: [], errors: [] };
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") result.results.push(...s.value);
    else result.errors.push({ provider: providers[i].name, message: (s.reason as Error).message });
  });
  return result;
}

/** Release detail, cached until an explicit refresh. */
export async function fetchReleaseDetail(
  userId: string,
  provider: ProviderName,
  id: string,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<ReleaseDetail> {
  const p = await providerByName(userId, provider);
  const key = `release:${id}`;
  if (!refresh) {
    const hit = await getCached<ReleaseDetail>(provider, key, FOREVER);
    if (hit) return hit;
  }
  const detail = await p.getRelease(id);
  await putCached(provider, key, detail);
  return detail;
}

export { ProviderError };
export type { ProviderName, ReleaseCandidate, ReleaseDetail };
