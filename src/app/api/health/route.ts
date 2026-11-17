import { connection } from "next/server";

import { getDb } from "@/db";

/** Liveness + DB check for Docker HEALTHCHECK and uptime monitors. Unauthenticated. */
export async function GET() {
  await connection();
  try {
    getDb().$client.prepare("SELECT 1").get();
    return Response.json(
      { status: "ok", version: process.env.APP_VERSION ?? "dev", db: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "error", version: process.env.APP_VERSION ?? "dev", db: "error" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
