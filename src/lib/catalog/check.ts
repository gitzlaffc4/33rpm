import "server-only";

import {
  findReleasesByBarcode,
  getReleaseSummary,
  mastersByProviderIds,
  releasesByProviderIds,
} from "@/db/repos/catalog";
import { ownedCounts, wishlistFor } from "@/db/repos/wishlist";
import { searchCatalog } from "@/lib/providers";
import type { ReleaseCandidate } from "@/lib/providers/types";

export type Verdict = "owned" | "wanted" | "owned-other-edition" | "new" | "unknown";

export type CheckResult = {
  barcode: string;
  verdict: Verdict;
  /** Copies of this exact release / of any edition. */
  copies: number;
  editionCopies: number;
  wish: { id: string; target: "master" | "release"; priority: number } | null;
  /** What the barcode is (first local release, else the first provider candidate). */
  title: string | null;
  artist: string | null;
  formatSummary: string | null;
  imageId: string | null;
  thumbUrl: string | null;
  masterId: string | null;
  releaseId: string | null;
  candidate: ReleaseCandidate | null;
  error: string | null;
};

/**
 * In-store check: does a scanned barcode match something I own, something I want, or is
 * it new? Local catalog first (instant, offline from providers); providers otherwise.
 */
export async function checkBarcode(userId: string, barcode: string): Promise<CheckResult> {
  const base: CheckResult = {
    barcode,
    verdict: "unknown",
    copies: 0,
    editionCopies: 0,
    wish: null,
    title: null,
    artist: null,
    formatSummary: null,
    imageId: null,
    thumbUrl: null,
    masterId: null,
    releaseId: null,
    candidate: null,
    error: null,
  };

  let releaseIds = await findReleasesByBarcode(barcode);
  let masterIds: string[] = [];
  if (releaseIds.length) {
    const summaries = (await Promise.all(releaseIds.map((id) => getReleaseSummary(id)))).filter(
      (s) => s !== null,
    );
    masterIds = [...new Set(summaries.map((s) => s.masterId))];
    const s = summaries[0];
    Object.assign(base, {
      title: s.title,
      artist: s.artist,
      formatSummary: s.formatSummary,
      imageId: s.coverImageId,
      masterId: s.masterId,
      releaseId: s.id,
    });
  } else {
    const { results, errors } = await searchCatalog(userId, "barcode", barcode);
    if (!results.length) {
      return { ...base, error: errors.length ? errors.map((e) => e.message).join("; ") : null };
    }
    const c = results[0];
    Object.assign(base, {
      title: c.title,
      artist: c.artist,
      formatSummary: c.formatSummary,
      thumbUrl: c.thumbUrl,
      candidate: c,
    });
    for (const provider of ["discogs", "musicbrainz"] as const) {
      const mine = results.filter((r) => r.provider === provider);
      const rel = await releasesByProviderIds(
        provider,
        mine.map((r) => r.providerReleaseId),
      );
      const mas = await mastersByProviderIds(
        provider,
        mine.flatMap((r) => (r.providerMasterId ? [r.providerMasterId] : [])),
      );
      releaseIds.push(...[...rel.values()].map((r) => r.id));
      masterIds.push(...[...rel.values()].map((r) => r.masterId), ...mas.values());
    }
    releaseIds = [...new Set(releaseIds)];
    masterIds = [...new Set(masterIds)];
    base.releaseId = releaseIds[0] ?? null;
    base.masterId = masterIds[0] ?? null;
  }

  const [owned, wishes] = await Promise.all([
    ownedCounts(userId, { masterIds, releaseIds }),
    wishlistFor(userId, { masterIds, releaseIds }),
  ]);
  base.copies = releaseIds.reduce((n, id) => n + (owned.releases.get(id) ?? 0), 0);
  base.editionCopies = masterIds.reduce((n, id) => n + (owned.masters.get(id) ?? 0), 0);
  const wish = wishes.find((w) => w.releaseId && releaseIds.includes(w.releaseId)) ?? wishes[0];
  base.wish = wish
    ? { id: wish.id, target: wish.releaseId ? "release" : "master", priority: wish.priority }
    : null;
  base.verdict = base.copies
    ? "owned"
    : base.wish
      ? "wanted"
      : base.editionCopies
        ? "owned-other-edition"
        : "new";
  return base;
}
