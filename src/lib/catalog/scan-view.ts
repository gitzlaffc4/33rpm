import "server-only";

import { getReleaseSummary } from "@/db/repos/catalog";
import type { ScanItem } from "@/db/repos/scans";

export type ScanView = {
  id: string;
  barcode: string;
  status: ScanItem["status"];
  error: string | null;
  /** What the barcode resolved to (matched), for display. */
  match: {
    title: string;
    artist: string;
    formatSummary: string;
    thumbUrl: string | null;
    imageId: string | null;
  } | null;
  candidates: number;
};

export async function toScanView(item: ScanItem): Promise<ScanView> {
  let match: ScanView["match"] = null;
  if (item.status === "matched") {
    if (item.releaseId) {
      const r = await getReleaseSummary(item.releaseId);
      if (r) {
        match = {
          title: r.title,
          artist: r.artist,
          formatSummary: r.formatSummary,
          thumbUrl: null,
          imageId: r.coverImageId,
        };
      }
    } else if (item.candidates[0]) {
      const c = item.candidates[0];
      match = {
        title: c.title,
        artist: c.artist,
        formatSummary: c.formatSummary,
        thumbUrl: c.thumbUrl,
        imageId: null,
      };
    }
  }
  return {
    id: item.id,
    barcode: item.barcode,
    status: item.status,
    error: item.error,
    match,
    candidates: item.candidates.length,
  };
}
