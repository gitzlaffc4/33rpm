/**
 * Catalog repo: shared metadata (artist → master → release) plus what a user owns
 * (copies, locations, tags). Portable across SQLite and PostgreSQL: matching uses the
 * normalized companion columns, upserts use onConflict*, transactions do DB work only.
 */
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  max,
  or,
  type SQL,
} from "drizzle-orm";

import { getDb, type Db, type DbHandle } from "@/db";
import { newId } from "@/db/ids";
import type { Schema } from "@/db/schema";
import { exclusive, withTransaction } from "@/db/tx";
import {
  barcodeVariants,
  defaultSortName,
  normalizeBarcode,
  normalizeCatalogNumber,
  searchKey,
} from "@/lib/catalog/normalize";
import type { Format, Track } from "@/lib/catalog/types";
import type { ArtistCredit, ProviderName, ReleaseDetail } from "@/lib/providers/types";

export type Condition = "M" | "NM" | "VG+" | "VG" | "G+" | "G" | "F" | "P";

/** Image row data (see src/lib/images.ts `StoredImage`). */
export type ImageRow = {
  id: string;
  kind: "cover" | "photo";
  path: string;
  width: number | null;
  height: number | null;
  sha256: string | null;
  sourceUrl: string | null;
  userId: string | null;
};

/* ------------------------------------------------------------------ helpers */

/**
 * Substring match on a normalized search column. `searchKey()` output holds only letters,
 * digits and spaces, so it needs no LIKE escaping; both sides are lowercase, so SQLite's
 * case-insensitive and Postgres's case-sensitive LIKE agree.
 */
function contains(col: Parameters<typeof like>[0], key: string): SQL {
  return like(col, `%${key}%`);
}

export function creditsDisplay(credits: { name: string; joinPhrase: string }[]): string {
  return credits
    .map((c, i) => c.name + (i < credits.length - 1 ? c.joinPhrase || ", " : ""))
    .join("");
}

async function insertImage(tx: Db, t: Schema, img: ImageRow | null): Promise<string | null> {
  if (!img) return null;
  await tx.insert(t.image).values(img).onConflictDoNothing();
  return img.id;
}

/** Find or create an artist by provider id, else by normalized name (provider-less). */
async function upsertArtist(
  tx: Db,
  t: Schema,
  provider: ProviderName | "manual",
  credit: ArtistCredit,
): Promise<string> {
  const nameSearch = searchKey(credit.name);
  const idCol =
    provider === "discogs"
      ? t.artist.discogsId
      : provider === "musicbrainz"
        ? t.artist.musicbrainzId
        : null;
  if (idCol && credit.providerId) {
    const [found] = await tx
      .select({ id: t.artist.id })
      .from(t.artist)
      .where(eq(idCol, credit.providerId));
    if (found) return found.id;
    // Same artist known from the other provider (or manual entry) without this id yet.
    const [byName] = await tx
      .select({ id: t.artist.id })
      .from(t.artist)
      .where(and(eq(t.artist.nameSearch, nameSearch), isNull(idCol)))
      .limit(1);
    if (byName) {
      await tx
        .update(t.artist)
        .set(
          provider === "discogs"
            ? { discogsId: credit.providerId }
            : { musicbrainzId: credit.providerId },
        )
        .where(eq(t.artist.id, byName.id));
      return byName.id;
    }
  } else {
    const [byName] = await tx
      .select({ id: t.artist.id })
      .from(t.artist)
      .where(eq(t.artist.nameSearch, nameSearch))
      .limit(1);
    if (byName) return byName.id;
  }
  const id = newId();
  await tx.insert(t.artist).values({
    id,
    name: credit.name,
    sortName: credit.sortName || defaultSortName(credit.name),
    nameSearch,
    discogsId: provider === "discogs" ? (credit.providerId ?? null) : null,
    musicbrainzId: provider === "musicbrainz" ? (credit.providerId ?? null) : null,
  });
  return id;
}

async function linkArtists(
  tx: Db,
  t: Schema,
  kind: "master" | "release",
  ownerId: string,
  provider: ProviderName | "manual",
  credits: ArtistCredit[],
) {
  const rows = [];
  for (const [position, c] of credits.entries()) {
    rows.push({
      artistId: await upsertArtist(tx, t, provider, c),
      position,
      joinPhrase: c.joinPhrase,
    });
  }
  if (kind === "master") {
    await tx.delete(t.masterArtist).where(eq(t.masterArtist.masterId, ownerId));
    if (rows.length)
      await tx.insert(t.masterArtist).values(rows.map((r) => ({ ...r, masterId: ownerId })));
  } else {
    await tx.delete(t.releaseArtist).where(eq(t.releaseArtist.releaseId, ownerId));
    if (rows.length)
      await tx.insert(t.releaseArtist).values(rows.map((r) => ({ ...r, releaseId: ownerId })));
  }
}

/**
 * Find the master for a release: by provider master id, else by normalized title + first
 * artist (so a Discogs CD and a MusicBrainz LP of the same album share one master).
 */
async function upsertMaster(
  tx: Db,
  t: Schema,
  provider: ProviderName | "manual",
  m: { providerId: string | null; title: string; year: number | null; artists: ArtistCredit[] },
  extra: { genres: string[]; styles: string[]; coverImageId: string | null },
): Promise<string> {
  const idCol =
    provider === "discogs"
      ? t.master.discogsMasterId
      : provider === "musicbrainz"
        ? t.master.musicbrainzReleaseGroupId
        : null;
  let id: string | undefined;
  if (idCol && m.providerId) {
    id = (await tx.select({ id: t.master.id }).from(t.master).where(eq(idCol, m.providerId)))[0]
      ?.id;
  }
  const titleSearch = searchKey(m.title);
  if (!id && m.artists[0]) {
    const artistSearch = searchKey(m.artists[0].name);
    const candidates = await tx
      .select({ id: t.master.id, provId: idCol ?? t.master.id })
      .from(t.master)
      .innerJoin(
        t.masterArtist,
        and(eq(t.masterArtist.masterId, t.master.id), eq(t.masterArtist.position, 0)),
      )
      .innerJoin(t.artist, eq(t.artist.id, t.masterArtist.artistId))
      .where(and(eq(t.master.titleSearch, titleSearch), eq(t.artist.nameSearch, artistSearch)));
    // Don't merge into a master that already carries a *different* id from this provider.
    id = candidates.find((c) => !idCol || c.provId === null || c.provId === m.providerId)?.id;
    if (id && idCol && m.providerId) {
      await tx
        .update(t.master)
        .set(
          provider === "discogs"
            ? { discogsMasterId: m.providerId }
            : { musicbrainzReleaseGroupId: m.providerId },
        )
        .where(eq(t.master.id, id));
    }
  }
  if (id) {
    const [cur] = await tx.select().from(t.master).where(eq(t.master.id, id));
    await tx
      .update(t.master)
      .set({
        year: cur.year ?? m.year,
        genres: cur.genres.length ? cur.genres : extra.genres,
        styles: cur.styles.length ? cur.styles : extra.styles,
        coverImageId: cur.coverImageId ?? extra.coverImageId,
        updatedAt: new Date(),
      })
      .where(eq(t.master.id, id));
    return id;
  }
  id = newId();
  await tx.insert(t.master).values({
    id,
    title: m.title,
    titleSearch,
    year: m.year,
    genres: extra.genres,
    styles: extra.styles,
    coverImageId: extra.coverImageId,
    discogsMasterId: provider === "discogs" ? m.providerId : null,
    musicbrainzReleaseGroupId: provider === "musicbrainz" ? m.providerId : null,
  });
  await linkArtists(tx, t, "master", id, provider, m.artists);
  return id;
}

async function setBarcodes(tx: Db, t: Schema, releaseId: string, barcodes: string[]) {
  await tx.delete(t.releaseBarcode).where(eq(t.releaseBarcode.releaseId, releaseId));
  const seen = new Set<string>();
  const rows = [];
  for (const barcode of barcodes) {
    const barcodeNorm = normalizeBarcode(barcode);
    if (!barcodeNorm || seen.has(barcodeNorm)) continue;
    seen.add(barcodeNorm);
    rows.push({ releaseId, barcode, barcodeNorm });
  }
  if (rows.length) await tx.insert(t.releaseBarcode).values(rows);
}

/* ------------------------------------------------------------------ releases */

/** Our release id for a provider release, if it's already in the catalog. */
export async function findReleaseByProviderId(
  provider: ProviderName,
  providerReleaseId: string,
  h: DbHandle = getDb(),
): Promise<string | null> {
  const col =
    provider === "discogs" ? h.t.release.discogsReleaseId : h.t.release.musicbrainzReleaseId;
  const [row] = await h.db
    .select({ id: h.t.release.id })
    .from(h.t.release)
    .where(eq(col, providerReleaseId));
  return row?.id ?? null;
}

/**
 * Insert (or refresh) a provider release with its master, artists, barcodes and cover.
 * Download the cover *before* calling this: the transaction does DB work only.
 */
export async function importRelease(
  detail: ReleaseDetail,
  cover: ImageRow | null,
  h: DbHandle = getDb(),
): Promise<{ releaseId: string; masterId: string; created: boolean }> {
  return withTransaction(async (tx) => {
    const t = h.t;
    const p = detail.provider;
    const coverImageId = await insertImage(tx, t, cover);
    const masterId = await upsertMaster(tx, t, p, detail.master, {
      genres: detail.genres,
      styles: detail.styles,
      coverImageId,
    });
    const idCol = p === "discogs" ? t.release.discogsReleaseId : t.release.musicbrainzReleaseId;
    const [existing] = await tx
      .select({ id: t.release.id, coverImageId: t.release.coverImageId })
      .from(t.release)
      .where(eq(idCol, detail.providerReleaseId));
    const values = {
      masterId,
      title: detail.title,
      titleSearch: searchKey(detail.title),
      format: detail.format,
      formatDetails: detail.formatDetails,
      formatSummary: detail.formatSummary,
      label: detail.label,
      catalogNumber: detail.catalogNumber,
      catalogNumberNorm: detail.catalogNumber ? normalizeCatalogNumber(detail.catalogNumber) : null,
      country: detail.country,
      releaseYear: detail.year,
      releaseDate: detail.releaseDate,
      tracklist: detail.tracklist,
      notes: detail.notes,
      dataSource: p,
      fetchedAt: new Date(),
    } as const;
    let releaseId: string;
    if (existing) {
      releaseId = existing.id;
      await tx
        .update(t.release)
        .set({
          ...values,
          coverImageId: coverImageId ?? existing.coverImageId,
          updatedAt: new Date(),
        })
        .where(eq(t.release.id, releaseId));
    } else {
      releaseId = newId();
      await tx.insert(t.release).values({
        ...values,
        id: releaseId,
        coverImageId,
        discogsReleaseId: p === "discogs" ? detail.providerReleaseId : null,
        musicbrainzReleaseId: p === "musicbrainz" ? detail.providerReleaseId : null,
      });
    }
    await linkArtists(tx, t, "release", releaseId, p, detail.artists);
    await setBarcodes(tx, t, releaseId, detail.barcodes);
    return { releaseId, masterId, created: !existing };
  }, h);
}

export type ManualReleaseInput = {
  artist: string;
  title: string;
  year: number | null;
  format: Format;
  formatDetails: string[];
  label: string | null;
  catalogNumber: string | null;
  country: string | null;
  barcode: string | null;
  tracklist: Track[];
  notes: string | null;
  /** Attach to this existing master ("different edition") instead of matching/creating one. */
  masterId?: string | null;
};

export async function createManualRelease(
  userId: string,
  input: ManualReleaseInput,
  cover: ImageRow | null,
  h: DbHandle = getDb(),
): Promise<{ releaseId: string; masterId: string }> {
  return withTransaction(async (tx) => {
    const t = h.t;
    const coverImageId = await insertImage(tx, t, cover);
    const credits: ArtistCredit[] = [{ name: input.artist, joinPhrase: "" }];
    const masterId =
      input.masterId ??
      (await upsertMaster(
        tx,
        t,
        "manual",
        { providerId: null, title: input.title, year: input.year, artists: credits },
        { genres: [], styles: [], coverImageId },
      ));
    const releaseId = newId();
    const fmtName = { vinyl: "Vinyl", cd: "CD", cassette: "Cassette", other: "Other" }[
      input.format
    ];
    await tx.insert(t.release).values({
      id: releaseId,
      masterId,
      title: input.title,
      titleSearch: searchKey(input.title),
      format: input.format,
      formatDetails: input.formatDetails,
      formatSummary: [fmtName, input.formatDetails.join(", ")].filter(Boolean).join(" · "),
      label: input.label,
      catalogNumber: input.catalogNumber,
      catalogNumberNorm: input.catalogNumber ? normalizeCatalogNumber(input.catalogNumber) : null,
      country: input.country,
      releaseYear: input.year,
      tracklist: input.tracklist,
      notes: input.notes,
      coverImageId,
      dataSource: "manual",
      createdByUserId: userId,
    });
    await linkArtists(tx, t, "release", releaseId, "manual", credits);
    if (input.barcode) await setBarcodes(tx, t, releaseId, [input.barcode]);
    if (coverImageId) {
      await tx
        .update(t.master)
        .set({ coverImageId })
        .where(and(eq(t.master.id, masterId), isNull(t.master.coverImageId)));
    }
    return { releaseId, masterId };
  }, h);
}

/** Local releases matching a barcode (scan → instant hit without a provider call). */
export async function findReleasesByBarcode(
  code: string,
  h: DbHandle = getDb(),
): Promise<string[]> {
  const variants = barcodeVariants(code);
  if (!variants.length) return [];
  const rows = await h.db
    .selectDistinct({ id: h.t.releaseBarcode.releaseId })
    .from(h.t.releaseBarcode)
    .where(inArray(h.t.releaseBarcode.barcodeNorm, variants));
  return rows.map((r) => r.id);
}

/* ------------------------------------------------------------------ copies */

export type CopyInput = {
  mediaCondition: Condition | null;
  sleeveCondition: Condition | null;
  priceMinor: number | null;
  currency: string | null;
  acquiredOn: string | null;
  source: string | null;
  locationId: string | null;
  notes: string | null;
  rating: number | null;
  tags: string[];
};

async function setCopyTags(tx: Db, t: Schema, userId: string, copyId: string, names: string[]) {
  await tx.delete(t.copyTag).where(eq(t.copyTag.copyId, copyId));
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().slice(0, 50);
    const norm = searchKey(name);
    if (norm && !wanted.has(norm)) wanted.set(norm, name);
  }
  if (!wanted.size) return;
  await tx
    .insert(t.tag)
    .values([...wanted].map(([nameNorm, name]) => ({ id: newId(), userId, name, nameNorm })))
    .onConflictDoNothing();
  const tags = await tx
    .select({ id: t.tag.id })
    .from(t.tag)
    .where(and(eq(t.tag.userId, userId), inArray(t.tag.nameNorm, [...wanted.keys()])));
  await tx.insert(t.copyTag).values(tags.map((tg) => ({ copyId, tagId: tg.id })));
}

async function assertLocation(tx: Db, t: Schema, userId: string, locationId: string | null) {
  if (!locationId) return;
  const [loc] = await tx
    .select({ id: t.location.id })
    .from(t.location)
    .where(and(eq(t.location.id, locationId), eq(t.location.userId, userId)));
  if (!loc) throw new Error("Unknown location");
}

export async function createCopy(
  userId: string,
  releaseId: string,
  input: CopyInput,
  h: DbHandle = getDb(),
): Promise<string> {
  return withTransaction(async (tx) => {
    await assertLocation(tx, h.t, userId, input.locationId);
    const id = newId();
    const { tags, ...values } = input;
    await tx.insert(h.t.copy).values({ ...values, id, userId, releaseId });
    await setCopyTags(tx, h.t, userId, id, tags);
    return id;
  }, h);
}

export async function updateCopy(
  userId: string,
  copyId: string,
  input: CopyInput,
  h: DbHandle = getDb(),
): Promise<boolean> {
  return withTransaction(async (tx) => {
    await assertLocation(tx, h.t, userId, input.locationId);
    const { tags, ...values } = input;
    const updated = await tx
      .update(h.t.copy)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(h.t.copy.id, copyId), eq(h.t.copy.userId, userId)))
      .returning({ id: h.t.copy.id });
    if (!updated.length) return false;
    await setCopyTags(tx, h.t, userId, copyId, tags);
    return true;
  }, h);
}

/** Delete a copy; returns the image ids of its photos so the caller can remove the files. */
export async function deleteCopy(userId: string, copyId: string, h: DbHandle = getDb()) {
  return withTransaction(async (tx) => {
    const t = h.t;
    const [c] = await tx
      .select({ id: t.copy.id, releaseId: t.copy.releaseId })
      .from(t.copy)
      .where(and(eq(t.copy.id, copyId), eq(t.copy.userId, userId)));
    if (!c) return null;
    const photos = await tx
      .select({ id: t.image.id, path: t.image.path })
      .from(t.copyPhoto)
      .innerJoin(t.image, eq(t.image.id, t.copyPhoto.imageId))
      .where(eq(t.copyPhoto.copyId, copyId));
    await tx.delete(t.copy).where(eq(t.copy.id, copyId));
    if (photos.length)
      await tx.delete(t.image).where(
        inArray(
          t.image.id,
          photos.map((p) => p.id),
        ),
      );
    const [m] = await tx
      .select({ masterId: t.release.masterId })
      .from(t.release)
      .where(eq(t.release.id, c.releaseId));
    return { masterId: m?.masterId ?? null, photos };
  }, h);
}

export async function addCopyPhoto(
  userId: string,
  copyId: string,
  img: ImageRow,
  h: DbHandle = getDb(),
) {
  return withTransaction(async (tx) => {
    const t = h.t;
    const [c] = await tx
      .select({ id: t.copy.id })
      .from(t.copy)
      .where(and(eq(t.copy.id, copyId), eq(t.copy.userId, userId)));
    if (!c) return false;
    const [{ n }] = await tx
      .select({ n: count() })
      .from(t.copyPhoto)
      .where(eq(t.copyPhoto.copyId, copyId));
    await tx.insert(t.image).values({ ...img, userId });
    await tx.insert(t.copyPhoto).values({ copyId, imageId: img.id, position: Number(n) });
    return true;
  }, h);
}

export async function deleteCopyPhoto(
  userId: string,
  copyId: string,
  imageId: string,
  h: DbHandle = getDb(),
) {
  return withTransaction(async (tx) => {
    const t = h.t;
    const [row] = await tx
      .select({ path: t.image.path })
      .from(t.copyPhoto)
      .innerJoin(t.copy, eq(t.copy.id, t.copyPhoto.copyId))
      .innerJoin(t.image, eq(t.image.id, t.copyPhoto.imageId))
      .where(
        and(
          eq(t.copyPhoto.copyId, copyId),
          eq(t.copyPhoto.imageId, imageId),
          eq(t.copy.userId, userId),
        ),
      );
    if (!row) return null;
    await tx.delete(t.image).where(eq(t.image.id, imageId));
    return row.path;
  }, h);
}

export type CopyRecord = Awaited<ReturnType<typeof getCopy>>;

export async function getCopy(userId: string, copyId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const [c] = await h.db
    .select()
    .from(t.copy)
    .where(and(eq(t.copy.id, copyId), eq(t.copy.userId, userId)));
  if (!c) return null;
  const [tags, photos, release] = await Promise.all([
    h.db
      .select({ name: t.tag.name })
      .from(t.copyTag)
      .innerJoin(t.tag, eq(t.tag.id, t.copyTag.tagId))
      .where(eq(t.copyTag.copyId, copyId))
      .orderBy(asc(t.tag.nameNorm)),
    h.db
      .select({ imageId: t.copyPhoto.imageId })
      .from(t.copyPhoto)
      .where(eq(t.copyPhoto.copyId, copyId))
      .orderBy(asc(t.copyPhoto.position)),
    getReleaseSummary(c.releaseId, h),
  ]);
  return {
    ...c,
    tags: tags.map((x) => x.name),
    photoIds: photos.map((p) => p.imageId),
    release: release!,
  };
}

/* ------------------------------------------------------------------ locations */

export async function listLocations(userId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const rows = await h.db
    .select({ id: t.location.id, name: t.location.name, copies: count(t.copy.id) })
    .from(t.location)
    .leftJoin(t.copy, eq(t.copy.locationId, t.location.id))
    .where(eq(t.location.userId, userId))
    .groupBy(t.location.id, t.location.name, t.location.sortOrder)
    .orderBy(asc(t.location.sortOrder), asc(t.location.name));
  return rows.map((r) => ({ ...r, copies: Number(r.copies) }));
}

/** Get-or-create a location by exact name. */
export async function ensureLocation(
  userId: string,
  name: string,
  h: DbHandle = getDb(),
): Promise<string> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Location name is required");
  await exclusive(async () => {
    await h.db
      .insert(h.t.location)
      .values({ id: newId(), userId, name: clean })
      .onConflictDoNothing();
  }, h);
  const [row] = await h.db
    .select({ id: h.t.location.id })
    .from(h.t.location)
    .where(and(eq(h.t.location.userId, userId), eq(h.t.location.name, clean)));
  return row.id;
}

export async function renameLocation(
  userId: string,
  id: string,
  name: string,
  h: DbHandle = getDb(),
) {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error("Location name is required");
  await exclusive(async () => {
    await h.db
      .update(h.t.location)
      .set({ name: clean, updatedAt: new Date() })
      .where(and(eq(h.t.location.id, id), eq(h.t.location.userId, userId)));
  }, h);
}

export async function deleteLocation(userId: string, id: string, h: DbHandle = getDb()) {
  await exclusive(async () => {
    await h.db
      .delete(h.t.location)
      .where(and(eq(h.t.location.id, id), eq(h.t.location.userId, userId)));
  }, h);
}

export async function listTags(userId: string, h: DbHandle = getDb()) {
  return h.db
    .select({ id: h.t.tag.id, name: h.t.tag.name })
    .from(h.t.tag)
    .where(eq(h.t.tag.userId, userId))
    .orderBy(asc(h.t.tag.nameNorm));
}

/* ------------------------------------------------------------------ reads */

async function artistsFor(kind: "master" | "release", ids: string[], h: DbHandle) {
  const out = new Map<string, { id: string; name: string; joinPhrase: string }[]>();
  if (!ids.length) return out;
  const t = h.t;
  const link = kind === "master" ? t.masterArtist : t.releaseArtist;
  const ownerCol = kind === "master" ? t.masterArtist.masterId : t.releaseArtist.releaseId;
  const rows = await h.db
    .select({
      ownerId: ownerCol,
      id: t.artist.id,
      name: t.artist.name,
      joinPhrase: link.joinPhrase,
      position: link.position,
    })
    .from(link)
    .innerJoin(t.artist, eq(t.artist.id, link.artistId))
    .where(inArray(ownerCol, ids))
    .orderBy(asc(ownerCol), asc(link.position));
  for (const r of rows) {
    const list = out.get(r.ownerId) ?? [];
    list.push({ id: r.id, name: r.name, joinPhrase: r.joinPhrase });
    out.set(r.ownerId, list);
  }
  return out;
}

export async function getReleaseSummary(releaseId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const [r] = await h.db
    .select({
      id: t.release.id,
      masterId: t.release.masterId,
      title: t.release.title,
      format: t.release.format,
      formatSummary: t.release.formatSummary,
      label: t.release.label,
      catalogNumber: t.release.catalogNumber,
      country: t.release.country,
      releaseYear: t.release.releaseYear,
      coverImageId: t.release.coverImageId,
      masterCoverImageId: t.master.coverImageId,
    })
    .from(t.release)
    .innerJoin(t.master, eq(t.master.id, t.release.masterId))
    .where(eq(t.release.id, releaseId));
  if (!r) return null;
  const artists = (await artistsFor("release", [r.id], h)).get(r.id) ?? [];
  const { masterCoverImageId, ...rest } = r;
  return {
    ...rest,
    coverImageId: r.coverImageId ?? masterCoverImageId,
    artist: creditsDisplay(artists),
  };
}

export type LibraryView = "albums" | "recent";
export type LibraryFilter = {
  q?: string;
  format?: Format;
  locationId?: string;
  artistId?: string;
  sort?: "artist" | "title" | "year" | "added";
};

export type AlbumCard = {
  masterId: string;
  title: string;
  year: number | null;
  artist: string;
  coverImageId: string | null;
  formats: Format[];
  copies: number;
  lastAdded: Date;
};

/** Albums (masters) the user owns at least one copy of, with filters. */
export async function listAlbums(
  userId: string,
  f: LibraryFilter = {},
  h: DbHandle = getDb(),
): Promise<AlbumCard[]> {
  const t = h.t;
  const where: SQL[] = [eq(t.copy.userId, userId)];
  if (f.format) where.push(eq(t.release.format, f.format));
  if (f.locationId) where.push(eq(t.copy.locationId, f.locationId));
  if (f.artistId) {
    const sub = h.db
      .select({ id: t.masterArtist.masterId })
      .from(t.masterArtist)
      .where(eq(t.masterArtist.artistId, f.artistId));
    where.push(inArray(t.master.id, sub));
  }
  const q = f.q ? searchKey(f.q) : "";
  if (q) {
    const byArtist = h.db
      .select({ id: t.masterArtist.masterId })
      .from(t.masterArtist)
      .innerJoin(t.artist, eq(t.artist.id, t.masterArtist.artistId))
      .where(contains(t.artist.nameSearch, q));
    where.push(
      or(
        contains(t.master.titleSearch, q),
        contains(t.release.titleSearch, q),
        inArray(t.master.id, byArtist),
      )!,
    );
  }
  const lastAdded = max(t.copy.createdAt);
  const rows = await h.db
    .select({
      masterId: t.master.id,
      title: t.master.title,
      year: t.master.year,
      coverImageId: t.master.coverImageId,
      copies: count(t.copy.id),
      lastAdded,
    })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .innerJoin(t.master, eq(t.master.id, t.release.masterId))
    .where(and(...where))
    .groupBy(t.master.id, t.master.title, t.master.year, t.master.coverImageId);

  const ids = rows.map((r) => r.masterId);
  const [artists, formats, covers] = await Promise.all([
    artistsFor("master", ids, h),
    ids.length
      ? h.db
          .selectDistinct({ masterId: t.release.masterId, format: t.release.format })
          .from(t.copy)
          .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
          .where(and(eq(t.copy.userId, userId), inArray(t.release.masterId, ids)))
      : Promise.resolve([]),
    // Fallback cover: any owned release's cover when the master has none.
    ids.length
      ? h.db
          .select({ masterId: t.release.masterId, coverImageId: t.release.coverImageId })
          .from(t.release)
          .where(and(inArray(t.release.masterId, ids), isNotNull(t.release.coverImageId)))
      : Promise.resolve([]),
  ]);
  const fmtBy = new Map<string, Format[]>();
  for (const r of formats) fmtBy.set(r.masterId, [...(fmtBy.get(r.masterId) ?? []), r.format]);
  const coverBy = new Map(covers.map((c) => [c.masterId, c.coverImageId]));

  const cards: (AlbumCard & { sortArtist: string })[] = rows.map((r) => {
    const a = artists.get(r.masterId) ?? [];
    return {
      masterId: r.masterId,
      title: r.title,
      year: r.year,
      artist: creditsDisplay(a),
      sortArtist: searchKey(defaultSortName(a[0]?.name ?? "")),
      coverImageId: r.coverImageId ?? coverBy.get(r.masterId) ?? null,
      formats: (fmtBy.get(r.masterId) ?? []).sort(),
      copies: Number(r.copies),
      lastAdded: toDate(r.lastAdded),
    };
  });
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const sort = f.sort ?? "artist";
  cards.sort((a, b) => {
    if (sort === "added") return b.lastAdded.getTime() - a.lastAdded.getTime();
    if (sort === "year")
      return (a.year ?? 9999) - (b.year ?? 9999) || collator.compare(a.title, b.title);
    if (sort === "title") return collator.compare(a.title, b.title);
    return collator.compare(a.sortArtist, b.sortArtist) || (a.year ?? 0) - (b.year ?? 0);
  });
  return cards.map(({ sortArtist: _s, ...c }) => c);
}

/** max() over a timestamp comes back as a number (SQLite) or string/Date (pg). */
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") return /^\d+$/.test(v) ? new Date(Number(v)) : new Date(v);
  return new Date(0);
}

export type RecentCopy = {
  copyId: string;
  createdAt: Date;
  masterId: string;
  title: string;
  artist: string;
  formatSummary: string;
  format: Format;
  coverImageId: string | null;
  location: string | null;
};

export async function listRecentCopies(
  userId: string,
  limit = 60,
  h: DbHandle = getDb(),
): Promise<RecentCopy[]> {
  const t = h.t;
  const rows = await h.db
    .select({
      copyId: t.copy.id,
      createdAt: t.copy.createdAt,
      releaseId: t.release.id,
      masterId: t.release.masterId,
      title: t.release.title,
      format: t.release.format,
      formatSummary: t.release.formatSummary,
      coverImageId: t.release.coverImageId,
      masterCoverImageId: t.master.coverImageId,
      location: t.location.name,
    })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .innerJoin(t.master, eq(t.master.id, t.release.masterId))
    .leftJoin(t.location, eq(t.location.id, t.copy.locationId))
    .where(eq(t.copy.userId, userId))
    .orderBy(desc(t.copy.createdAt), desc(t.copy.id))
    .limit(limit);
  const artists = await artistsFor("release", [...new Set(rows.map((r) => r.releaseId))], h);
  return rows.map(({ releaseId, masterCoverImageId, ...r }) => ({
    ...r,
    coverImageId: r.coverImageId ?? masterCoverImageId,
    artist: creditsDisplay(artists.get(releaseId) ?? []),
  }));
}

export async function listArtists(userId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const rows = await h.db
    .select({
      id: t.artist.id,
      name: t.artist.name,
      sortName: t.artist.sortName,
      albums: countDistinct(t.release.masterId),
      copies: count(t.copy.id),
    })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .innerJoin(t.masterArtist, eq(t.masterArtist.masterId, t.release.masterId))
    .innerJoin(t.artist, eq(t.artist.id, t.masterArtist.artistId))
    .where(eq(t.copy.userId, userId))
    .groupBy(t.artist.id, t.artist.name, t.artist.sortName);
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  return rows
    .map((r) => ({ ...r, albums: Number(r.albums), copies: Number(r.copies) }))
    .sort((a, b) => collator.compare(a.sortName ?? a.name, b.sortName ?? b.name));
}

export async function getArtist(id: string, h: DbHandle = getDb()) {
  const [a] = await h.db.select().from(h.t.artist).where(eq(h.t.artist.id, id));
  return a ?? null;
}

export async function formatCounts(userId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const rows = await h.db
    .select({ format: t.release.format, copies: count(t.copy.id) })
    .from(t.copy)
    .innerJoin(t.release, eq(t.release.id, t.copy.releaseId))
    .where(eq(t.copy.userId, userId))
    .groupBy(t.release.format);
  return rows.map((r) => ({ format: r.format, copies: Number(r.copies) }));
}

export async function countCopies(userId: string, h: DbHandle = getDb()) {
  return h.db.$count(h.t.copy, eq(h.t.copy.userId, userId));
}

/** Album page: master, its editions in the catalog, and the user's copies of each. */
export async function getMasterPage(userId: string, masterId: string, h: DbHandle = getDb()) {
  const t = h.t;
  const [m] = await h.db.select().from(t.master).where(eq(t.master.id, masterId));
  if (!m) return null;
  const releases = await h.db
    .select()
    .from(t.release)
    .where(eq(t.release.masterId, masterId))
    .orderBy(asc(t.release.releaseYear), asc(t.release.title));
  const releaseIds = releases.map((r) => r.id);
  const [masterArtists, releaseArtists, copies, barcodes] = await Promise.all([
    artistsFor("master", [masterId], h),
    artistsFor("release", releaseIds, h),
    releaseIds.length
      ? h.db
          .select({
            id: t.copy.id,
            releaseId: t.copy.releaseId,
            mediaCondition: t.copy.mediaCondition,
            sleeveCondition: t.copy.sleeveCondition,
            priceMinor: t.copy.priceMinor,
            currency: t.copy.currency,
            acquiredOn: t.copy.acquiredOn,
            source: t.copy.source,
            notes: t.copy.notes,
            rating: t.copy.rating,
            location: t.location.name,
            createdAt: t.copy.createdAt,
          })
          .from(t.copy)
          .leftJoin(t.location, eq(t.location.id, t.copy.locationId))
          .where(and(eq(t.copy.userId, userId), inArray(t.copy.releaseId, releaseIds)))
          .orderBy(asc(t.copy.createdAt))
      : Promise.resolve([]),
    releaseIds.length
      ? h.db
          .select({ releaseId: t.releaseBarcode.releaseId, barcode: t.releaseBarcode.barcode })
          .from(t.releaseBarcode)
          .where(inArray(t.releaseBarcode.releaseId, releaseIds))
      : Promise.resolve([]),
  ]);
  const copyIds = copies.map((c) => c.id);
  const tagRows = copyIds.length
    ? await h.db
        .select({ copyId: t.copyTag.copyId, name: t.tag.name })
        .from(t.copyTag)
        .innerJoin(t.tag, eq(t.tag.id, t.copyTag.tagId))
        .where(inArray(t.copyTag.copyId, copyIds))
    : [];
  const artists = masterArtists.get(masterId) ?? [];
  return {
    master: { ...m, artists, artist: creditsDisplay(artists) },
    releases: releases.map((r) => ({
      ...r,
      artist: creditsDisplay(releaseArtists.get(r.id) ?? []),
      barcodes: barcodes.filter((b) => b.releaseId === r.id).map((b) => b.barcode),
      copies: copies
        .filter((c) => c.releaseId === r.id)
        .map((c) => ({
          ...c,
          tags: tagRows.filter((tg) => tg.copyId === c.id).map((tg) => tg.name),
        })),
    })),
  };
}

/**
 * Which provider releases / masters the user already owns — for duplicate warnings on
 * search results.
 */
export async function ownershipFor(
  userId: string,
  provider: ProviderName,
  releaseIds: string[],
  masterIds: string[],
  h: DbHandle = getDb(),
) {
  const t = h.t;
  const relCol =
    provider === "discogs" ? t.release.discogsReleaseId : t.release.musicbrainzReleaseId;
  const masCol =
    provider === "discogs" ? t.master.discogsMasterId : t.master.musicbrainzReleaseGroupId;
  const releases = new Map<string, number>();
  const masters = new Map<string, string>();
  if (releaseIds.length) {
    const rows = await h.db
      .select({ pid: relCol, n: count(t.copy.id) })
      .from(t.release)
      .innerJoin(t.copy, and(eq(t.copy.releaseId, t.release.id), eq(t.copy.userId, userId)))
      .where(inArray(relCol, releaseIds))
      .groupBy(relCol);
    for (const r of rows) if (r.pid) releases.set(r.pid, Number(r.n));
  }
  if (masterIds.length) {
    const rows = await h.db
      .selectDistinct({ pid: masCol, id: t.master.id })
      .from(t.master)
      .innerJoin(t.release, eq(t.release.masterId, t.master.id))
      .innerJoin(t.copy, and(eq(t.copy.releaseId, t.release.id), eq(t.copy.userId, userId)))
      .where(inArray(masCol, masterIds));
    for (const r of rows) if (r.pid) masters.set(r.pid, r.id);
  }
  return { releases, masters };
}

/** Image metadata for serving. Covers are shared; photos only to their owner. */
export async function getImage(id: string, h: DbHandle = getDb()) {
  const [img] = await h.db
    .select({
      id: h.t.image.id,
      path: h.t.image.path,
      kind: h.t.image.kind,
      userId: h.t.image.userId,
    })
    .from(h.t.image)
    .where(eq(h.t.image.id, id));
  return img ?? null;
}

/** Provider ids for a release ("Refresh metadata"). */
export async function getReleaseRef(releaseId: string, h: DbHandle = getDb()) {
  const [r] = await h.db
    .select({
      id: h.t.release.id,
      masterId: h.t.release.masterId,
      dataSource: h.t.release.dataSource,
      discogsReleaseId: h.t.release.discogsReleaseId,
      musicbrainzReleaseId: h.t.release.musicbrainzReleaseId,
    })
    .from(h.t.release)
    .where(eq(h.t.release.id, releaseId));
  return r ?? null;
}

export async function masterExists(masterId: string, h: DbHandle = getDb()) {
  return (await h.db.$count(h.t.master, eq(h.t.master.id, masterId))) > 0;
}
