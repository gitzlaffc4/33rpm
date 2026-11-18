"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { createCopy, ensureLocation } from "@/db/repos/catalog";
import { dismissScans, enqueueScan, getScan, listOpenScans, setScanResult } from "@/db/repos/scans";
import { parseCopyForm } from "@/lib/catalog/copy-form";
import { scheduleLookup } from "@/lib/catalog/scan-lookup";
import { ensureProviderRelease } from "@/lib/catalog/service";
import { requireUser } from "@/lib/session";

export type ScanActionState = { ok?: string; error?: string };

/** Crate mode: queue a scanned (or typed) barcode for a background lookup. */
export async function queueScan(barcode: string): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  try {
    const id = await enqueueScan(user.id, barcode);
    scheduleLookup(id);
    return { id };
  } catch {
    return { error: "That doesn't look like a barcode." };
  }
}

export async function dismissScan(id: string) {
  const user = await requireUser();
  await dismissScans(user.id, [id]);
  refresh();
}

export async function retryScan(id: string) {
  const user = await requireUser();
  const item = await getScan(id);
  if (!item || item.userId !== user.id) return;
  await setScanResult(id, { status: "pending", error: null });
  scheduleLookup(id);
  refresh();
}

/**
 * Review screen submit: `pick-<scanId>` is "local", "<provider>:<releaseId>" or "skip".
 * Shared copy fields (condition, location, …) apply to every added copy. Each item is
 * handled on its own, so one failure doesn't lose the rest.
 */
export async function confirmScans(
  _prev: ScanActionState,
  formData: FormData,
): Promise<ScanActionState> {
  const user = await requireUser();
  const form = parseCopyForm(formData);
  if (!form.ok) return { error: form.error };
  const f = form.data;
  const locationId = f.newLocation ? await ensureLocation(user.id, f.newLocation) : f.locationId;
  const items = await listOpenScans(user.id);
  let added = 0;
  const failed: string[] = [];
  for (const item of items) {
    const pick = String(formData.get(`pick-${item.id}`) ?? "skip");
    if (pick === "skip") continue;
    try {
      let releaseId: string;
      if (pick === "local" && item.releaseId) {
        releaseId = item.releaseId;
      } else {
        const [provider, ...rest] = pick.split(":");
        const providerId = rest.join(":");
        if ((provider !== "discogs" && provider !== "musicbrainz") || !providerId) continue;
        if (
          !item.candidates.some(
            (c) => c.provider === provider && c.providerReleaseId === providerId,
          )
        )
          continue;
        ({ releaseId } = await ensureProviderRelease(user.id, provider, providerId));
      }
      const copyId = await createCopy(user.id, releaseId, {
        mediaCondition: f.mediaCondition,
        sleeveCondition: f.sleeveCondition,
        priceMinor: f.priceMinor,
        currency: f.priceMinor === null ? null : f.currency,
        acquiredOn: f.acquiredOn,
        source: f.source,
        locationId,
        notes: f.notes,
        rating: f.rating,
        tags: f.tags,
      });
      await setScanResult(item.id, { status: "added", copyId, releaseId });
      added++;
    } catch (e) {
      failed.push(item.barcode);
      await setScanResult(item.id, { status: "error", error: (e as Error).message });
    }
  }
  if (failed.length) {
    refresh();
    return { error: `Added ${added}. Couldn't add ${failed.join(", ")}; try those again.` };
  }
  if (!added) return { error: "Nothing selected." };
  redirect(`/scan/review?added=${added}`);
}
