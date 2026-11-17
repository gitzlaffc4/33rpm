import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuth } from "@/lib/auth";

/** Data access layer for the current session. Reads request headers: call inside <Suspense>. */
export const getCurrentSession = cache(async () => {
  // Read the request first: this defers rendering to request time, so the build
  // never constructs auth (which needs runtime env and the database).
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

/** Returns the signed-in user or redirects to /login. */
export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.user;
}
