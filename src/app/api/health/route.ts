import { connection } from "next/server";

import { getDb } from "@/db";
import { APP_COMMIT_SHORT, APP_VERSION } from "@/lib/version";

/** Liveness + DB check for Docker HEALTHCHECK and uptime monitors. Unauthenticated. */
export async function GET() {
  await connection();
  try {
    getDb().$client.prepare("SELECT 1").get();
    return Response.json(
      { status: "ok", version: APP_VERSION, commit: APP_COMMIT_SHORT, db: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "error", version: APP_VERSION, commit: APP_COMMIT_SHORT, db: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
