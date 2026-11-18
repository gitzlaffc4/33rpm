import { sessionUser } from "@/lib/api-auth";
import { isAllowedImageUrl, remoteThumbnail } from "@/lib/images";

/**
 * Search-result thumbnails, fetched server-side and cached on disk so the browser never
 * talks to third parties. Only allowlisted cover-art hosts (no open proxy / SSRF).
 */
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedImageUrl(url)) return new Response("Forbidden", { status: 403 });
  const bytes = await remoteThumbnail(url);
  if (!bytes)
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
