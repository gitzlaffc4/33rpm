import { sessionUser } from "@/lib/api-auth";
import { globalSearch } from "@/lib/catalog/search";

/** Instant search (as you type) for the search page and the header box. */
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
  return Response.json(await globalSearch(user.id, q), {
    headers: { "Cache-Control": "no-store" },
  });
}
