"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  addCopyPhoto,
  createCopy,
  createManualRelease,
  deleteCopy,
  deleteCopyPhoto,
  deleteLocation,
  ensureLocation,
  getReleaseRef,
  getReleaseSummary,
  masterExists,
  renameLocation,
  updateCopy,
  type CopyInput,
} from "@/db/repos/catalog";
import { parseCopyForm, type CopyForm } from "@/lib/catalog/copy-form";
import { FORMAT_ORDER } from "@/lib/catalog/format";
import { ensureProviderRelease, removeImageFiles } from "@/lib/catalog/service";
import { storeImage } from "@/lib/images";
import { ProviderError } from "@/lib/providers/http";
import { requireUser } from "@/lib/session";

export type FormState = { ok?: string; error?: string; field?: string };

const MAX_UPLOAD = 20 * 1024 * 1024;

async function toCopyInput(userId: string, f: CopyForm): Promise<CopyInput> {
  const locationId = f.newLocation ? await ensureLocation(userId, f.newLocation) : f.locationId;
  return {
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
  };
}

function providerMessage(e: unknown) {
  if (e instanceof ProviderError) {
    return `Couldn't reach ${e.provider === "discogs" ? "Discogs" : "MusicBrainz"} (${e.message}). Try again in a moment.`;
  }
  throw e;
}

/** Add a copy of a release found through a provider search. */
export async function addCopyFromProvider(
  provider: "discogs" | "musicbrainz",
  providerReleaseId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const form = parseCopyForm(formData);
  if (!form.ok) return { error: form.error, field: form.field };
  let releaseId: string;
  try {
    ({ releaseId } = await ensureProviderRelease(user.id, provider, providerReleaseId));
  } catch (e) {
    return { error: providerMessage(e) };
  }
  const copyId = await createCopy(user.id, releaseId, await toCopyInput(user.id, form.data));
  const release = await getReleaseSummary(releaseId);
  redirect(`/album/${release!.masterId}?added=${copyId}`);
}

/** "Add another copy" of a release already in the catalog. */
export async function addCopyToRelease(
  releaseId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const form = parseCopyForm(formData);
  if (!form.ok) return { error: form.error, field: form.field };
  const release = await getReleaseSummary(releaseId);
  if (!release) return { error: "That release no longer exists." };
  const copyId = await createCopy(user.id, releaseId, await toCopyInput(user.id, form.data));
  redirect(`/album/${release.masterId}?added=${copyId}`);
}

export async function saveCopy(
  copyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const form = parseCopyForm(formData);
  if (!form.ok) return { error: form.error, field: form.field };
  const ok = await updateCopy(user.id, copyId, await toCopyInput(user.id, form.data));
  if (!ok) return { error: "Copy not found." };
  refresh();
  return { ok: "Saved." };
}

export async function removeCopy(copyId: string): Promise<FormState> {
  const user = await requireUser();
  const res = await deleteCopy(user.id, copyId);
  if (!res) return { error: "Copy not found." };
  await removeImageFiles(res.photos.map((p) => p.path));
  redirect(res.masterId ? `/album/${res.masterId}` : "/library");
}

async function readImageUpload(
  formData: FormData,
  field: string,
): Promise<Buffer | null | "invalid"> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_UPLOAD || !file.type.startsWith("image/")) return "invalid";
  return Buffer.from(await file.arrayBuffer());
}

export async function uploadCopyPhoto(
  copyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const bytes = await readImageUpload(formData, "photo");
  if (bytes === null) return { error: "Choose a photo first." };
  if (bytes === "invalid") return { error: "Photos must be images under 20 MB." };
  let img;
  try {
    img = await storeImage(bytes, { kind: "photo", userId: user.id });
  } catch {
    return { error: "That file couldn't be read as an image." };
  }
  if (!(await addCopyPhoto(user.id, copyId, img))) {
    await removeImageFiles([img.path]);
    return { error: "Copy not found." };
  }
  refresh();
  return { ok: "Photo added." };
}

export async function removeCopyPhoto(copyId: string, imageId: string): Promise<FormState> {
  const user = await requireUser();
  const path = await deleteCopyPhoto(user.id, copyId, imageId);
  if (path) await removeImageFiles([path]);
  refresh();
  return {};
}

const ManualSchema = z.object({
  artist: z.string().trim().min(1, "Artist is required").max(200),
  title: z.string().trim().min(1, "Title is required").max(300),
  year: z
    .string()
    .trim()
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1877).max(2200).nullable()),
  format: z.enum(FORMAT_ORDER as ["vinyl", "cd", "cassette", "other"]),
  formatDetails: z.string().trim().max(200).default(""),
  label: z.string().trim().max(200).default(""),
  catalogNumber: z.string().trim().max(100).default(""),
  country: z.string().trim().max(100).default(""),
  barcode: z.string().trim().max(40).default(""),
  tracklist: z.string().max(10_000).default(""),
  releaseNotes: z.string().trim().max(4000).default(""),
  masterId: z.string().trim().max(64).default(""),
});

/** "A1 Second Hand News 2:43" per line → tracks. */
function parseTracklist(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 300)
    .map((line, i) => {
      const m =
        /^(?:([A-Z]?\d{1,3}(?:[-.]\d{1,3})?|[A-Z]\d?)[.)]?\s+)?(.+?)(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/.exec(
          line,
        );
      return { position: m?.[1] ?? String(i + 1), title: m?.[2] ?? line, duration: m?.[3] };
    });
}

/** Manual entry for items no provider knows about, with an optional cover upload. */
export async function createManualEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string") raw[k] = v;
  const parsed = ManualSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message ?? "Invalid input", field: String(issue?.path[0] ?? "") };
  }
  const copy = parseCopyForm(formData);
  if (!copy.ok) return { error: copy.error, field: copy.field };
  const m = parsed.data;
  if (m.masterId && !(await masterExists(m.masterId))) return { error: "Album not found." };

  const coverBytes = await readImageUpload(formData, "cover");
  if (coverBytes === "invalid")
    return { error: "Covers must be images under 20 MB.", field: "cover" };
  let cover = null;
  if (coverBytes) {
    try {
      cover = await storeImage(coverBytes, { kind: "cover" });
    } catch {
      return { error: "That cover couldn't be read as an image.", field: "cover" };
    }
  }
  const { releaseId, masterId } = await createManualRelease(
    user.id,
    {
      artist: m.artist,
      title: m.title,
      year: m.year,
      format: m.format,
      formatDetails: m.formatDetails
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      label: m.label || null,
      catalogNumber: m.catalogNumber || null,
      country: m.country || null,
      barcode: m.barcode || null,
      tracklist: parseTracklist(m.tracklist),
      notes: m.releaseNotes || null,
      masterId: m.masterId || null,
    },
    cover,
  );
  const copyId = await createCopy(user.id, releaseId, await toCopyInput(user.id, copy.data));
  redirect(`/album/${masterId}?added=${copyId}`);
}

/** Explicit "Refresh metadata" (never done on page view). */
export async function refreshReleaseMetadata(releaseId: string): Promise<FormState> {
  const user = await requireUser();
  const ref = await getReleaseRef(releaseId);
  if (!ref) return { error: "Release not found." };
  const provider = ref.discogsReleaseId
    ? "discogs"
    : ref.musicbrainzReleaseId
      ? "musicbrainz"
      : null;
  if (!provider) return { error: "Manual entries have no provider to refresh from." };
  try {
    await ensureProviderRelease(
      user.id,
      provider,
      (ref.discogsReleaseId ?? ref.musicbrainzReleaseId)!,
      {
        refresh: true,
      },
    );
  } catch (e) {
    return { error: providerMessage(e) };
  }
  refresh();
  return { ok: "Metadata refreshed." };
}

export async function addLocation(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the location a name." };
  await ensureLocation(user.id, name);
  refresh();
  return { ok: `Added “${name}”.` };
}

export async function saveLocationName(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name can't be empty." };
  try {
    await renameLocation(user.id, id, name);
  } catch {
    return { error: "A location with that name already exists." };
  }
  refresh();
  return { ok: "Renamed." };
}

export async function removeLocation(id: string): Promise<FormState> {
  const user = await requireUser();
  await deleteLocation(user.id, id);
  refresh();
  return {};
}
