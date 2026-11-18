import "server-only";

import { connection } from "next/server";

import { getAuth } from "@/lib/auth";

/** Signed-in user for a route handler (the proxy skips /api/*), or null. */
export async function sessionUser(request: Request) {
  await connection(); // request-time only: never prerender
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
