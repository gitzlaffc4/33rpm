import { listOpenScans } from "@/db/repos/scans";
import { sessionUser } from "@/lib/api-auth";
import { toScanView } from "@/lib/catalog/scan-view";

/** Crate mode polls this while lookups run (the scanner page is a client component). */
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const items = await Promise.all((await listOpenScans(user.id)).map(toScanView));
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
