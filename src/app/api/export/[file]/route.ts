import {
  COLLECTION_COLUMNS,
  exportCollection,
  exportWishlist,
  WISHLIST_COLUMNS,
} from "@/db/repos/export";
import { sessionUser } from "@/lib/api-auth";
import { toCsv } from "@/lib/csv";
import { APP_VERSION } from "@/lib/version";

/** Your data, downloadable: collection.csv, wishlist.csv, library.json. */
export async function GET(request: Request, ctx: RouteContext<"/api/export/[file]">) {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { file } = await ctx.params;
  const day = new Date().toISOString().slice(0, 10);
  const headers = (type: string, name: string) => ({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="33rpm-${name}-${day}.${type.includes("json") ? "json" : "csv"}"`,
    "Cache-Control": "no-store",
  });
  if (file === "collection.csv") {
    const rows = await exportCollection(user.id);
    return new Response(
      toCsv(
        [...COLLECTION_COLUMNS],
        rows.map((r) => COLLECTION_COLUMNS.map((c) => r[c])),
      ),
      { headers: headers("text/csv; charset=utf-8", "collection") },
    );
  }
  if (file === "wishlist.csv") {
    const rows = await exportWishlist(user.id);
    return new Response(
      toCsv(
        [...WISHLIST_COLUMNS],
        rows.map((r) => WISHLIST_COLUMNS.map((c) => r[c])),
      ),
      { headers: headers("text/csv; charset=utf-8", "wishlist") },
    );
  }
  if (file === "library.json") {
    const body = {
      format: "33rpm-library",
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      collection: await exportCollection(user.id),
      wishlist: await exportWishlist(user.id),
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: headers("application/json", "library"),
    });
  }
  return new Response("Not found", { status: 404 });
}
