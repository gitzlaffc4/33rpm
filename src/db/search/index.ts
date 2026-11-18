/**
 * SearchIndex (portability rule 11): the only place full-text search touches SQL.
 * - SQLite: FTS5 virtual table `search_doc` (prefix indexes, diacritic folding), bm25 rank.
 * - PostgreSQL: `search_doc.tsv` (simple config, prefix tsquery) ranked by ts_rank, plus
 *   pg_trgm similarity for typos when the extension is available.
 *
 * One document per release: artists, release and album titles, label, catalog number
 * (raw and normalized), barcodes, format, country and year. The index is derived data:
 * `rebuild()` recreates it from the catalog (e.g. after importing a library).
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { DbHandle } from "@/db/client";
import { searchKey } from "@/lib/catalog/normalize";

export type SearchHit = { releaseId: string; rank: number };

export interface SearchIndex {
  /** (Re)index these releases. */
  upsert(releaseIds: string[]): Promise<void>;
  /** Drop and rebuild the whole index; returns the number of documents. */
  rebuild(): Promise<number>;
  /** Releases matching every word (prefix match), best first. */
  search(query: string, limit?: number): Promise<SearchHit[]>;
  count(): Promise<number>;
}

/** Search words: normalized, de-duplicated, at most 8. */
export function queryTokens(query: string): string[] {
  return [...new Set(searchKey(query).split(" ").filter(Boolean))].slice(0, 8);
}

/** Documents for these releases (or all releases). */
export async function buildDocuments(h: DbHandle, releaseIds?: string[]) {
  const t = h.t;
  const releases = await h.db
    .select({
      id: t.release.id,
      title: t.release.title,
      masterTitle: t.master.title,
      label: t.release.label,
      catalogNumber: t.release.catalogNumber,
      catalogNumberNorm: t.release.catalogNumberNorm,
      formatSummary: t.release.formatSummary,
      format: t.release.format,
      country: t.release.country,
      year: t.release.releaseYear,
    })
    .from(t.release)
    .innerJoin(t.master, eq(t.master.id, t.release.masterId))
    .where(releaseIds ? inArray(t.release.id, releaseIds) : undefined)
    .orderBy(asc(t.release.id));
  if (!releases.length) return [];
  const ids = releases.map((r) => r.id);
  const [artists, barcodes] = await Promise.all([
    h.db
      .select({ releaseId: t.releaseArtist.releaseId, name: t.artist.name })
      .from(t.releaseArtist)
      .innerJoin(t.artist, eq(t.artist.id, t.releaseArtist.artistId))
      .where(inArray(t.releaseArtist.releaseId, ids)),
    h.db
      .select({ releaseId: t.releaseBarcode.releaseId, code: t.releaseBarcode.barcodeNorm })
      .from(t.releaseBarcode)
      .where(inArray(t.releaseBarcode.releaseId, ids)),
  ]);
  return releases.map((r) => ({
    releaseId: r.id,
    body: searchKey(
      [
        ...artists.filter((a) => a.releaseId === r.id).map((a) => a.name),
        r.title,
        r.masterTitle !== r.title ? r.masterTitle : "",
        r.label ?? "",
        r.catalogNumber ?? "",
        r.catalogNumberNorm ?? "",
        ...barcodes.filter((b) => b.releaseId === r.id).map((b) => b.code),
        r.formatSummary,
        r.format,
        r.country ?? "",
        r.year ? String(r.year) : "",
      ].join(" "),
    ),
  }));
}

const CHUNK = 200;

class SqliteSearchIndex implements SearchIndex {
  constructor(private h: DbHandle) {}

  private write(docs: { releaseId: string; body: string }[], ids: string[]) {
    const s = this.h.sqlite!;
    const del = s.prepare("DELETE FROM search_doc WHERE release_id = ?");
    const ins = s.prepare("INSERT INTO search_doc (release_id, body) VALUES (?, ?)");
    s.transaction(() => {
      for (const id of ids) del.run(id);
      for (const d of docs) ins.run(d.releaseId, d.body);
    })();
  }

  async upsert(releaseIds: string[]) {
    for (let i = 0; i < releaseIds.length; i += CHUNK) {
      const ids = releaseIds.slice(i, i + CHUNK);
      this.write(await buildDocuments(this.h, ids), ids);
    }
  }

  async rebuild() {
    const docs = await buildDocuments(this.h);
    const s = this.h.sqlite!;
    s.transaction(() => {
      s.exec("DELETE FROM search_doc");
      const ins = s.prepare("INSERT INTO search_doc (release_id, body) VALUES (?, ?)");
      for (const d of docs) ins.run(d.releaseId, d.body);
    })();
    return docs.length;
  }

  async search(query: string, limit = 50) {
    const tokens = queryTokens(query);
    if (!tokens.length) return [];
    // Tokens are letters/digits only (searchKey), so quoting is safe; `*` = prefix match.
    const match = tokens.map((t) => `"${t}"*`).join(" ");
    const rows = this.h
      .sqlite!.prepare(
        "SELECT release_id AS releaseId, bm25(search_doc) AS rank FROM search_doc WHERE search_doc MATCH ? ORDER BY rank LIMIT ?",
      )
      .all(match, limit) as { releaseId: string; rank: number }[];
    return rows.map((r) => ({ releaseId: r.releaseId, rank: -r.rank }));
  }

  async count() {
    return (this.h.sqlite!.prepare("SELECT COUNT(*) AS n FROM search_doc").get() as { n: number })
      .n;
  }
}

class PgSearchIndex implements SearchIndex {
  private trgm: boolean | null = null;
  constructor(private h: DbHandle) {}
  private get db() {
    return this.h.db as unknown as NodePgDatabase;
  }

  private async hasTrigram() {
    if (this.trgm === null) {
      const res = await this.db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
      this.trgm = res.rows.length > 0;
    }
    return this.trgm;
  }

  async upsert(releaseIds: string[]) {
    for (let i = 0; i < releaseIds.length; i += CHUNK) {
      const ids = releaseIds.slice(i, i + CHUNK);
      const docs = await buildDocuments(this.h, ids);
      await this.db.transaction(async (tx) => {
        for (const d of docs) {
          await tx.execute(
            sql`INSERT INTO search_doc (release_id, body) VALUES (${d.releaseId}, ${d.body}) ON CONFLICT (release_id) DO UPDATE SET body = EXCLUDED.body`,
          );
        }
      });
    }
  }

  async rebuild() {
    const docs = await buildDocuments(this.h);
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM search_doc`);
      for (const d of docs) {
        await tx.execute(
          sql`INSERT INTO search_doc (release_id, body) VALUES (${d.releaseId}, ${d.body})`,
        );
      }
    });
    return docs.length;
  }

  async search(query: string, limit = 50) {
    const tokens = queryTokens(query);
    if (!tokens.length) return [];
    const tsquery = tokens.map((t) => `${t}:*`).join(" & ");
    const phrase = tokens.join(" ");
    const fuzzy = (await this.hasTrigram()) && phrase.length >= 3;
    const res = fuzzy
      ? await this.db.execute(sql`
          SELECT release_id AS "releaseId",
                 ts_rank(tsv, to_tsquery('simple', ${tsquery})) + similarity(body, ${phrase}) AS rank
          FROM search_doc
          WHERE tsv @@ to_tsquery('simple', ${tsquery}) OR body % ${phrase}
          ORDER BY rank DESC LIMIT ${limit}`)
      : await this.db.execute(sql`
          SELECT release_id AS "releaseId", ts_rank(tsv, to_tsquery('simple', ${tsquery})) AS rank
          FROM search_doc
          WHERE tsv @@ to_tsquery('simple', ${tsquery})
          ORDER BY rank DESC LIMIT ${limit}`);
    return (res.rows as { releaseId: string; rank: number }[]).map((r) => ({
      releaseId: r.releaseId,
      rank: Number(r.rank),
    }));
  }

  async count() {
    const res = await this.db.execute(sql`SELECT COUNT(*)::int AS n FROM search_doc`);
    return Number((res.rows[0] as { n: number }).n);
  }
}

export function getSearchIndex(h: DbHandle): SearchIndex {
  return h.dialect === "pg" ? new PgSearchIndex(h) : new SqliteSearchIndex(h);
}
