import "server-only";

import fs from "node:fs/promises";

import { findReleaseByProviderId, importRelease } from "@/db/repos/catalog";
import { downloadCover, imageFile, IMAGE_SIZES } from "@/lib/images";
import { fetchReleaseDetail, type ProviderName } from "@/lib/providers";

/**
 * Make sure a provider release is in the local catalog. Network work (detail + cover
 * download) happens before the DB transaction, per the portability rules.
 */
export async function ensureProviderRelease(
  userId: string,
  provider: ProviderName,
  providerReleaseId: string,
  { refresh = false }: { refresh?: boolean } = {},
) {
  const existing = await findReleaseByProviderId(provider, providerReleaseId);
  if (existing && !refresh) return { releaseId: existing, created: false };
  const detail = await fetchReleaseDetail(userId, provider, providerReleaseId, { refresh });
  const cover = existing && !refresh ? null : await downloadCover(detail.coverUrl);
  const res = await importRelease(detail, cover);
  return { releaseId: res.releaseId, masterId: res.masterId, created: res.created };
}

/** Remove the files behind deleted image rows (best effort). */
export async function removeImageFiles(paths: string[]) {
  await Promise.all(
    paths.flatMap((p) =>
      IMAGE_SIZES.map((size) => fs.rm(imageFile(p, size), { force: true }).catch(() => {})),
    ),
  );
}
