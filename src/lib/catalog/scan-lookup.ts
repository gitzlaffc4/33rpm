import "server-only";

import PQueue from "p-queue";

import { findReleasesByBarcode } from "@/db/repos/catalog";
import { getScan, listPendingScans, setScanResult } from "@/db/repos/scans";
import { searchCatalog } from "@/lib/providers";
import type { ReleaseCandidate } from "@/lib/providers/types";

/**
 * Classify barcode search results. Candidates come in provider order (Discogs first when
 * configured); only the first provider that found anything decides, so the same pressing
 * listed on both Discogs and MusicBrainz isn't "ambiguous".
 */
export function classifyCandidates(
  results: ReleaseCandidate[],
): "matched" | "ambiguous" | "not_found" {
  if (!results.length) return "not_found";
  const first = results[0].provider;
  return results.filter((r) => r.provider === first).length === 1 ? "matched" : "ambiguous";
}

export async function lookupScan(id: string) {
  const item = await getScan(id);
  if (!item || item.status !== "pending") return;
  try {
    // A release already in the catalog needs no provider call at all.
    const local = await findReleasesByBarcode(item.barcode);
    if (local.length === 1) {
      await setScanResult(id, { status: "matched", releaseId: local[0] });
      return;
    }
    const { results, errors } = await searchCatalog(item.userId, "barcode", item.barcode);
    if (!results.length && errors.length) {
      await setScanResult(id, { status: "error", error: errors.map((e) => e.message).join("; ") });
      return;
    }
    await setScanResult(id, {
      status: classifyCandidates(results),
      candidates: results.slice(0, 12),
      error: null,
    });
  } catch (e) {
    await setScanResult(id, { status: "error", error: (e as Error).message }).catch(() => {});
  }
}

const g = globalThis as unknown as { __33rpmScanQueue?: PQueue };
/** In-process work queue; providers have their own rate limits underneath. */
function queue() {
  g.__33rpmScanQueue ??= new PQueue({ concurrency: 2 });
  return g.__33rpmScanQueue;
}

export function scheduleLookup(id: string) {
  void queue().add(() => lookupScan(id));
}

/** Re-queue lookups interrupted by a restart. */
export async function resumePendingLookups() {
  const pending = await listPendingScans();
  for (const { id } of pending) scheduleLookup(id);
  return pending.length;
}
