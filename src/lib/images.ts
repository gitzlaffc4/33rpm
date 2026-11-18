import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import { newId } from "@/db/ids";
import { getEnv } from "@/env";
import { fetchBytes } from "@/lib/providers/http";

export const IMAGE_SIZES = [600, 1200] as const;
export type ImageSize = (typeof IMAGE_SIZES)[number];

export type StoredImage = {
  id: string;
  kind: "cover" | "photo";
  path: string;
  width: number;
  height: number;
  sha256: string;
  sourceUrl: string | null;
  userId: string | null;
};

/** Hosts whose images we fetch (covers and search thumbnails). */
const IMAGE_HOSTS = [/^coverartarchive\.org$/, /(^|\.)archive\.org$/, /^i\.discogs\.com$/];

export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && IMAGE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function resolveInImagesDir(rel: string): string {
  const root = path.resolve(getEnv().IMAGES_DIR);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) throw new Error("invalid image path");
  return full;
}

export function imageFile(relPath: string, size: ImageSize): string {
  return resolveInImagesDir(`${relPath}-${size}.webp`);
}

/**
 * Normalize an image (EXIF rotation, sRGB) and store it as WebP at 600 and 1200 px
 * (never upscaled). Returns the row data for the `image` table; the caller inserts it.
 */
export async function storeImage(
  bytes: Buffer,
  meta: { kind: "cover" | "photo"; sourceUrl?: string | null; userId?: string | null },
): Promise<StoredImage> {
  const id = newId();
  const rel = path.posix.join(`${meta.kind}s`, id.slice(-2), id);
  const base = sharp(bytes, { failOn: "error" }).rotate();
  const info = await base.metadata();
  if (!info.width || !info.height) throw new Error("not an image");
  await fs.mkdir(path.dirname(resolveInImagesDir(rel)), { recursive: true });
  for (const size of IMAGE_SIZES) {
    await base
      .clone()
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: size >= 1200 ? 82 : 78 })
      .toFile(imageFile(rel, size));
  }
  return {
    id,
    kind: meta.kind,
    path: rel,
    width: info.width,
    height: info.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sourceUrl: meta.sourceUrl ?? null,
    userId: meta.userId ?? null,
  };
}

/** Download and store a cover. Returns null (not an error) if it can't be fetched. */
export async function downloadCover(url: string | null): Promise<StoredImage | null> {
  if (!url || !isAllowedImageUrl(url)) return null;
  try {
    const provider = new URL(url).hostname === "i.discogs.com" ? "discogs" : "coverart";
    const { bytes } = await fetchBytes(url, { provider });
    return await storeImage(bytes, { kind: "cover", sourceUrl: url });
  } catch (e) {
    console.warn(`[33rpm] cover download failed (${url}): ${(e as Error).message}`);
    return null;
  }
}

/**
 * Small cached thumbnail for a remote image (search results). Misses are cached
 * too so a missing cover isn't re-requested on every search.
 */
export async function remoteThumbnail(url: string): Promise<Buffer | null> {
  if (!isAllowedImageUrl(url)) return null;
  const key = createHash("sha256").update(url).digest("hex");
  const file = resolveInImagesDir(path.posix.join("remote", key.slice(0, 2), `${key}.webp`));
  const miss = `${file}.miss`;
  try {
    return await fs.readFile(file);
  } catch {}
  try {
    const stat = await fs.stat(miss);
    if (Date.now() - stat.mtimeMs < 7 * 86_400_000) return null;
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const provider = new URL(url).hostname === "i.discogs.com" ? "discogs" : "coverart";
    const { bytes } = await fetchBytes(url, { provider, maxBytes: 10 * 1024 * 1024 });
    const out = await sharp(bytes)
      .rotate()
      .resize(300, 300, { fit: "inside" })
      .webp({ quality: 75 })
      .toBuffer();
    await fs.writeFile(file, out);
    return out;
  } catch {
    await fs.writeFile(miss, "");
    return null;
  }
}
