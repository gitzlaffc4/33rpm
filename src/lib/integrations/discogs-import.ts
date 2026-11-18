import "server-only";

import PQueue from "p-queue";
import { z } from "zod";

import {
  createCopy,
  ensureLocation,
  findCopyByDiscogsInstance,
  findReleaseByProviderId,
  importRelease,
  updateCopy,
  type CopyInput,
} from "@/db/repos/catalog";
import { createJob, getJob, unfinishedJobs, updateJob, type JobProgress } from "@/db/repos/jobs";
import { getReleaseRef } from "@/db/repos/catalog";
import { addToWishlist } from "@/db/repos/wishlist";
import { normalizeCondition } from "@/lib/catalog/csv-mapping";
import { looksLikeBarcode, yearFrom } from "@/lib/catalog/normalize";
import { resolveDiscogsToken } from "@/lib/discogs-token";
import { downloadCover } from "@/lib/images";
import {
  createDiscogsProvider,
  credits,
  discogsClient,
  discogsFormat,
} from "@/lib/providers/discogs";
import type { ReleaseDetail } from "@/lib/providers/types";

/*
 * Discogs collection + wantlist import (Phase 4). Idempotent: copies are keyed by the
 * Discogs collection instance id, wishlist items by release, so a re-run only reports
 * what changed. Runs as a background job; the Discogs queue keeps it within rate limits.
 */

export const DISCOGS_JOB = "discogs-import";

export type DiscogsImportOptions = {
  collection: boolean;
  wantlist: boolean;
  /** Collection folders become storage locations or tags. */
  foldersAs: "locations" | "tags" | "ignore";
  /** Also fetch full release details (tracklist, barcodes): one request per new release. */
  details: boolean;
};

export type DiscogsImportReport = {
  username: string;
  collection: { added: number; updated: number; skipped: number; failed: number };
  wantlist: { added: number; skipped: number; failed: number };
  details: { fetched: number; failed: number };
  errors: string[];
};

const BasicInfo = z.object({
  id: z.number(),
  master_id: z.number().nullish(),
  title: z.string(),
  year: z.number().nullish(),
  cover_image: z.string().nullish(),
  formats: z
    .array(
      z.object({
        name: z.string(),
        qty: z.string().nullish(),
        descriptions: z.array(z.string()).optional(),
        text: z.string().nullish(),
      }),
    )
    .optional(),
  labels: z.array(z.object({ name: z.string(), catno: z.string().nullish() })).optional(),
  artists: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      anv: z.string().nullish(),
      join: z.string().nullish(),
    }),
  ),
  genres: z.array(z.string()).optional(),
  styles: z.array(z.string()).optional(),
});

const Pagination = z.object({ page: z.number(), pages: z.number(), items: z.number() });

const CollectionPage = z.object({
  pagination: Pagination,
  releases: z.array(
    z.object({
      id: z.number(),
      instance_id: z.number(),
      folder_id: z.number(),
      rating: z.number().nullish(),
      date_added: z.string().nullish(),
      notes: z.array(z.object({ field_id: z.number(), value: z.string() })).optional(),
      basic_information: BasicInfo,
    }),
  ),
});

const WantsPage = z.object({
  pagination: Pagination,
  wants: z.array(
    z.object({ id: z.number(), notes: z.string().nullish(), basic_information: BasicInfo }),
  ),
});

const Identity = z.object({ username: z.string() });
const Folders = z.object({ folders: z.array(z.object({ id: z.number(), name: z.string() })) });
const Fields = z.object({ fields: z.array(z.object({ id: z.number(), name: z.string() })) });

/** A release detail from a collection/wantlist entry (no tracklist or barcodes yet). */
export function mapBasicInformation(bi: z.infer<typeof BasicInfo>): ReleaseDetail {
  const artists = credits(bi.artists);
  const fmts = bi.formats ?? [];
  const first = fmts[0];
  const label = bi.labels?.[0];
  return {
    provider: "discogs",
    providerReleaseId: String(bi.id),
    title: bi.title,
    artists,
    year: yearFrom(bi.year ?? null),
    releaseDate: null,
    country: null,
    format: discogsFormat(first?.name),
    formatDetails: fmts.flatMap((f) => [
      Number(f.qty ?? 1) > 1 ? `${f.qty}×${f.name}` : f.name,
      ...(f.descriptions ?? []),
      ...(f.text ? [f.text] : []),
    ]),
    formatSummary: first
      ? [
          Number(first.qty ?? 1) > 1 ? `${first.qty}×${first.name}` : first.name,
          (first.descriptions ?? []).join(", "),
        ]
          .filter(Boolean)
          .join(" · ")
      : "Unknown",
    label: label?.name.replace(/\s+\(\d+\)$/, "") ?? null,
    catalogNumber: label?.catno && label.catno !== "none" ? label.catno : null,
    barcodes: [],
    tracklist: [],
    genres: bi.genres ?? [],
    styles: bi.styles ?? [],
    notes: null,
    coverUrl: bi.cover_image && !bi.cover_image.includes("spacer.gif") ? bi.cover_image : null,
    master: {
      providerId: bi.master_id ? String(bi.master_id) : null,
      title: bi.title,
      year: yearFrom(bi.year ?? null),
      artists,
    },
    webUrl: `https://www.discogs.com/release/${bi.id}`,
  };
}

/** Ensure a release exists locally from basic information (doesn't overwrite fuller data). */
async function ensureBasicRelease(bi: z.infer<typeof BasicInfo>, created: Set<string>) {
  const existing = await findReleaseByProviderId("discogs", String(bi.id));
  if (existing) return existing;
  const detail = mapBasicInformation(bi);
  const cover = await downloadCover(detail.coverUrl);
  const { releaseId } = await importRelease(detail, cover);
  created.add(releaseId);
  return releaseId;
}

function sameCopy(a: CopyInput, b: CopyInput) {
  return (
    a.mediaCondition === b.mediaCondition &&
    a.sleeveCondition === b.sleeveCondition &&
    (a.notes ?? null) === (b.notes ?? null) &&
    (a.rating ?? null) === (b.rating ?? null) &&
    (a.locationId ?? null) === (b.locationId ?? null) &&
    [...a.tags].sort().join("|") === [...b.tags].sort().join("|")
  );
}

export async function runDiscogsImport(
  userId: string,
  opts: DiscogsImportOptions,
  onProgress: (p: JobProgress) => Promise<void> = async () => {},
): Promise<DiscogsImportReport> {
  const token = await resolveDiscogsToken(userId);
  if (!token) throw new Error("Add a Discogs personal access token in Settings first.");
  const get = discogsClient(token);
  const { username } = await get("/oauth/identity", Identity);
  const u = encodeURIComponent(username);
  const report: DiscogsImportReport = {
    username,
    collection: { added: 0, updated: 0, skipped: 0, failed: 0 },
    wantlist: { added: 0, skipped: 0, failed: 0 },
    details: { fetched: 0, failed: 0 },
    errors: [],
  };
  const created = new Set<string>();
  const fail = (what: string, e: unknown) => {
    if (report.errors.length < 50) report.errors.push(`${what}: ${(e as Error).message}`);
  };

  if (opts.collection) {
    const [{ folders }, { fields }] = await Promise.all([
      get(`/users/${u}/collection/folders`, Folders),
      get(`/users/${u}/collection/fields`, Fields),
    ]);
    const folderName = new Map(folders.map((f) => [f.id, f.name]));
    const fieldId = (name: string) => fields.find((f) => f.name.toLowerCase() === name)?.id;
    const mediaField = fieldId("media condition");
    const sleeveField = fieldId("sleeve condition");
    const notesField = fieldId("notes");
    const locations = new Map<string, string>();

    let done = 0;
    for (let page = 1, pages = 1; page <= pages; page++) {
      const data = await get(
        `/users/${u}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=asc`,
        CollectionPage,
      );
      pages = data.pagination.pages;
      for (const item of data.releases) {
        try {
          const releaseId = await ensureBasicRelease(item.basic_information, created);
          const note = (id?: number) =>
            id === undefined ? "" : (item.notes?.find((n) => n.field_id === id)?.value ?? "");
          const folder = folderName.get(item.folder_id);
          const useFolder = folder && item.folder_id !== 0 && item.folder_id !== 1; // 0 = All, 1 = Uncategorized
          let locationId: string | null = null;
          if (useFolder && opts.foldersAs === "locations") {
            locationId = locations.get(folder) ?? (await ensureLocation(userId, folder));
            locations.set(folder, locationId);
          }
          const input: CopyInput = {
            mediaCondition: normalizeCondition(note(mediaField)),
            sleeveCondition: normalizeCondition(note(sleeveField)),
            priceMinor: null,
            currency: null,
            acquiredOn: item.date_added ? item.date_added.slice(0, 10) : null,
            source: "Discogs collection",
            locationId,
            notes: note(notesField) || null,
            rating: item.rating ? item.rating : null,
            tags: useFolder && opts.foldersAs === "tags" ? [folder] : [],
            discogsInstanceId: String(item.instance_id),
          };
          const existing = await findCopyByDiscogsInstance(userId, String(item.instance_id));
          if (!existing) {
            await createCopy(userId, releaseId, input);
            report.collection.added++;
          } else {
            // Keep what the user changed locally that Discogs doesn't know (price, source…).
            const merged: CopyInput = {
              ...input,
              priceMinor: existing.priceMinor,
              currency: existing.currency,
              acquiredOn: existing.acquiredOn ?? input.acquiredOn,
              source: existing.source,
              locationId: opts.foldersAs === "locations" ? input.locationId : existing.locationId,
              tags:
                opts.foldersAs === "tags"
                  ? [...new Set([...existing.tags, ...input.tags])]
                  : existing.tags,
            };
            const current: CopyInput = { ...existing, tags: existing.tags };
            if (sameCopy(current, merged)) report.collection.skipped++;
            else {
              const { discogsInstanceId: _keep, ...rest } = merged;
              await updateCopy(userId, existing.id, rest);
              report.collection.updated++;
            }
          }
        } catch (e) {
          report.collection.failed++;
          fail(`Collection release ${item.id}`, e);
        }
        done++;
        if (done % 10 === 0) {
          await onProgress({
            done,
            total: data.pagination.items,
            step: "Importing your collection",
          });
        }
      }
    }
  }

  if (opts.wantlist) {
    let done = 0;
    for (let page = 1, pages = 1; page <= pages; page++) {
      const data = await get(`/users/${u}/wants?per_page=100&page=${page}`, WantsPage);
      pages = data.pagination.pages;
      for (const want of data.wants) {
        try {
          const releaseId = await ensureBasicRelease(want.basic_information, created);
          const res = await addToWishlist(userId, { releaseId }, { notes: want.notes || null });
          if (res.created) report.wantlist.added++;
          else report.wantlist.skipped++;
        } catch (e) {
          report.wantlist.failed++;
          fail(`Want ${want.id}`, e);
        }
        done++;
        if (done % 10 === 0)
          await onProgress({ done, total: data.pagination.items, step: "Importing your wantlist" });
      }
    }
  }

  // Full details (tracklist, barcodes) for releases created by this run.
  if (opts.details && created.size) {
    const provider = createDiscogsProvider(token);
    let done = 0;
    for (const releaseId of created) {
      try {
        const ref = await getReleaseRef(releaseId);
        if (ref?.discogsReleaseId) {
          const detail = await provider.getReleaseOnly(ref.discogsReleaseId);
          detail.barcodes = detail.barcodes.filter(looksLikeBarcode);
          await importRelease(detail, null);
          report.details.fetched++;
        }
      } catch (e) {
        report.details.failed++;
        fail(`Details for ${releaseId}`, e);
      }
      done++;
      if (done % 5 === 0)
        await onProgress({ done, total: created.size, step: "Fetching tracklists and barcodes" });
    }
  }
  return report;
}

const g = globalThis as unknown as { __33rpmJobQueue?: PQueue };
function jobQueue() {
  g.__33rpmJobQueue ??= new PQueue({ concurrency: 1 });
  return g.__33rpmJobQueue;
}

async function runJob(jobId: string) {
  const job = await getJob(jobId);
  if (!job || job.status === "done" || job.status === "failed") return;
  const opts = (job.report as { options?: DiscogsImportOptions } | null)?.options;
  if (!opts) return;
  await updateJob(jobId, {
    status: "running",
    progress: { done: 0, total: null, step: "Connecting to Discogs" },
  });
  try {
    const report = await runDiscogsImport(job.userId, opts, (progress) =>
      updateJob(jobId, { progress }),
    );
    await updateJob(jobId, {
      status: "done",
      progress: { done: 1, total: 1, step: "Done" },
      report: { options: opts, ...report },
    });
  } catch (e) {
    await updateJob(jobId, { status: "failed", error: (e as Error).message });
  }
}

/** Queue a Discogs import for a user. */
export async function startDiscogsImport(userId: string, opts: DiscogsImportOptions) {
  const id = await createJob(userId, DISCOGS_JOB);
  await updateJob(id, { report: { options: opts } });
  void jobQueue().add(() => runJob(id));
  return id;
}

/** Resume jobs a restart interrupted (safe: imports are idempotent). */
export async function resumeImportJobs() {
  const jobs = await unfinishedJobs();
  for (const j of jobs) void jobQueue().add(() => runJob(j.id));
  return jobs.length;
}
