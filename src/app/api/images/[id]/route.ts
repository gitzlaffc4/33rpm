import fs from "node:fs/promises";

import { getImage } from "@/db/repos/catalog";
import { sessionUser } from "@/lib/api-auth";
import { imageFile, IMAGE_SIZES, type ImageSize } from "@/lib/images";

/** Stored covers (any signed-in user) and copy photos (owner only), as WebP. */
export async function GET(request: Request, ctx: RouteContext<"/api/images/[id]">) {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const img = await getImage(id);
  if (!img || (img.kind === "photo" && img.userId !== user.id)) {
    return new Response("Not found", { status: 404 });
  }
  const want = Number(new URL(request.url).searchParams.get("size") ?? 600);
  const size: ImageSize = (IMAGE_SIZES as readonly number[]).includes(want)
    ? (want as ImageSize)
    : 600;
  try {
    const bytes = await fs.readFile(imageFile(img.path, size));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        // Image ids are never reused, so the bytes behind a URL never change.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
