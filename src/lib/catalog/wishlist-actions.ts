"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getReleaseSummary } from "@/db/repos/catalog";
import {
  addToWishlist,
  deleteWishlistItem,
  updateWishlistItem,
  type WishlistStatus,
} from "@/db/repos/wishlist";
import { checkBarcode, type CheckResult } from "@/lib/catalog/check";
import { pickFields } from "@/lib/catalog/copy-form";
import { parsePrice } from "@/lib/catalog/format";
import { ensureProviderRelease } from "@/lib/catalog/service";
import { CURRENCY_CODES } from "@/lib/currencies";
import { ProviderError } from "@/lib/providers/http";
import { requireUser } from "@/lib/session";

export type WishState = { ok?: string; error?: string; id?: string };

/** In-store check for a scanned barcode. */
export async function checkScannedBarcode(code: string): Promise<CheckResult> {
  const user = await requireUser();
  return checkBarcode(user.id, code.replace(/\D/g, ""));
}

/** Want a release found through a provider: this pressing, or any edition of the album. */
export async function wantProviderRelease(
  provider: "discogs" | "musicbrainz",
  providerReleaseId: string,
  target: "release" | "master",
): Promise<WishState> {
  const user = await requireUser();
  let releaseId: string;
  try {
    ({ releaseId } = await ensureProviderRelease(user.id, provider, providerReleaseId));
  } catch (e) {
    if (e instanceof ProviderError) return { error: `Couldn't reach the provider: ${e.message}` };
    throw e;
  }
  return wantRelease(releaseId, target);
}

/** Want a release already in the catalog (album page). */
export async function wantRelease(
  releaseId: string,
  target: "release" | "master",
): Promise<WishState> {
  const user = await requireUser();
  const r = await getReleaseSummary(releaseId);
  if (!r) return { error: "Release not found." };
  const { id, created } = await addToWishlist(
    user.id,
    target === "master" ? { masterId: r.masterId } : { releaseId },
  );
  refresh();
  return { ok: created ? "Added to your wishlist." : "Already on your wishlist.", id };
}

const WishSchema = z.object({
  priority: z.enum(["1", "2", "3"]).transform((v) => Number(v) as 1 | 2 | 3),
  maxPrice: z.string().trim().max(20).default(""),
  currency: z.enum(CURRENCY_CODES),
  notes: z.string().trim().max(4000).default(""),
  status: z.enum(["wanted", "ordered", "acquired"]),
  tags: z.string().max(1000).default(""),
});

export async function saveWishlistItem(
  id: string,
  _prev: WishState,
  formData: FormData,
): Promise<WishState> {
  const user = await requireUser();
  const parsed = WishSchema.safeParse(
    pickFields(formData, ["priority", "maxPrice", "currency", "notes", "status", "tags"] as const),
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const v = parsed.data;
  const maxPriceMinor = v.maxPrice ? parsePrice(v.maxPrice, v.currency) : null;
  if (Number.isNaN(maxPriceMinor)) return { error: "Enter a price like 24.99" };
  const ok = await updateWishlistItem(user.id, id, {
    priority: v.priority,
    maxPriceMinor,
    currency: maxPriceMinor === null ? null : v.currency,
    notes: v.notes || null,
    status: v.status as WishlistStatus,
    tags: v.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!ok) return { error: "Wishlist item not found." };
  refresh();
  return { ok: "Saved." };
}

export async function removeWishlistItem(id: string): Promise<WishState> {
  const user = await requireUser();
  await deleteWishlistItem(user.id, id);
  redirect("/wishlist");
}
