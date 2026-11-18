import "server-only";

import {
  listAlbums,
  listArtists,
  listLocations,
  listTags,
  mastersOfReleases,
  type AlbumCard,
} from "@/db/repos/catalog";
import { getDb } from "@/db";
import { listWishlist, type WishlistEntry } from "@/db/repos/wishlist";
import { getSearchIndex } from "@/db/search";
import { searchKey } from "./normalize";

export type GlobalSearchResult = {
  query: string;
  albums: AlbumCard[];
  artists: { id: string; name: string; albums: number }[];
  wishlist: WishlistEntry[];
  tags: { id: string; name: string }[];
  locations: { id: string; name: string; copies: number }[];
};

/**
 * Search everything I have: albums (via the full-text index: artists, titles, labels,
 * catalog numbers, barcodes), artists, wishlist, tags and locations.
 */
export async function globalSearch(userId: string, query: string): Promise<GlobalSearchResult> {
  const q = searchKey(query);
  const empty = { query, albums: [], artists: [], wishlist: [], tags: [], locations: [] };
  if (!q) return empty;
  const hits = await getSearchIndex(getDb()).search(query, 300);
  const masters = await mastersOfReleases(hits.map((h) => h.releaseId));
  const order = new Map<string, number>();
  for (const h of hits) {
    const m = masters.get(h.releaseId);
    if (m && !order.has(m)) order.set(m, order.size);
  }
  const words = q.split(" ");
  const matches = (text: string) => {
    const k = searchKey(text);
    return words.every((w) => k.split(" ").some((part) => part.startsWith(w)));
  };
  const [albums, artists, wishlist, tags, locations] = await Promise.all([
    listAlbums(userId, { masterIds: [...order.keys()] }),
    listArtists(userId),
    listWishlist(userId, { sort: "priority" }),
    listTags(userId),
    listLocations(userId),
  ]);
  return {
    query,
    albums: albums.sort((a, b) => order.get(a.masterId)! - order.get(b.masterId)!).slice(0, 40),
    artists: artists.filter((a) => matches(a.name)).slice(0, 10),
    wishlist: wishlist
      .filter((w) => order.has(w.masterId) || matches(`${w.artist} ${w.title}`))
      .slice(0, 10),
    tags: tags.filter((t) => matches(t.name)).slice(0, 10),
    locations: locations.filter((l) => matches(l.name)).slice(0, 10),
  };
}
