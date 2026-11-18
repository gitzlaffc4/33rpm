/** Collection stats, aggregated in JS from one query (thousands of rows is cheap). */
import { eq } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import type { Format } from "@/lib/catalog/types";

export type Bucket = { key: string; count: number };

function top(map: Map<string, number>, n?: number): Bucket[] {
  const all = [...map]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return n ? all.slice(0, n) : all;
}
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export async function collectionStats(userId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const rows = await h.db
    .select({
      masterId: t.master.id,
      year: t.master.year,
      genres: t.master.genres,
      format: t.release.format,
      label: t.release.label,
      priceMinor: t.copy.priceMinor,
      currency: t.copy.currency,
      acquiredOn: t.copy.acquiredOn,
      createdAt: t.copy.createdAt,
      locationId: t.copy.locationId,
    })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .innerJoin(t.master, eq(t.master.id, t.release.masterId))
    .where(eq(t.copy.userId, userId));

  const formats = new Map<string, number>();
  const genres = new Map<string, number>();
  const decades = new Map<string, number>();
  const labels = new Map<string, number>();
  /** currency → year → minor units */
  const spend = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const masters = new Set<string>();
  let priced = 0;

  for (const r of rows) {
    masters.add(r.masterId);
    bump(formats, r.format);
    for (const g of r.genres) bump(genres, g);
    if (r.year) bump(decades, `${Math.floor(r.year / 10) * 10}s`);
    if (r.label) bump(labels, r.label);
    if (r.priceMinor !== null && r.currency) {
      priced++;
      const year = (r.acquiredOn ?? r.createdAt.toISOString()).slice(0, 4);
      const byYear = spend.get(r.currency) ?? new Map<string, number>();
      bump(byYear, year, r.priceMinor);
      spend.set(r.currency, byYear);
      bump(totals, r.currency, r.priceMinor);
    }
  }
  const mainCurrency = top(totals)[0]?.key ?? null;
  const artists = await h.db
    .selectDistinct({ id: t.masterArtist.artistId })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .innerJoin(t.masterArtist, eq(t.masterArtist.masterId, t.release.masterId))
    .where(eq(t.copy.userId, userId));

  return {
    copies: rows.length,
    albums: masters.size,
    artists: artists.length,
    priced,
    formats: top(formats) as (Bucket & { key: Format })[],
    genres: top(genres, 10),
    decades: top(decades).sort((a, b) => a.key.localeCompare(b.key)),
    labels: top(labels, 10),
    totals: top(totals),
    mainCurrency,
    /** Spend per year in the main currency, oldest first. */
    spendByYear: mainCurrency
      ? [...(spend.get(mainCurrency) ?? new Map())]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => a.key.localeCompare(b.key))
      : [],
  };
}
