import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/env";
import { OIDC_PROVIDER_ID } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentSession } from "@/lib/session";
import { needsSetup } from "@/lib/setup-code";
import { AuthCardSkeleton } from "../auth-skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <LoginCard searchParams={searchParams} />
    </Suspense>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function LoginCard({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  await connection();
  if (await needsSetup()) redirect("/setup");

  const next = safeNextPath(first(params.next));
  if (await getCurrentSession()) redirect(next);

  const env = getEnv();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Your collection is waiting.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          localLogin={env.AUTH_LOCAL_LOGIN}
          oidc={
            env.OIDC_ENABLED ? { providerId: OIDC_PROVIDER_ID, name: env.OIDC_PROVIDER_NAME } : null
          }
          next={next}
          initialError={authErrorMessage(first(params.error))}
          notice={
            first(params.setup) === "done"
              ? "Admin account created. Sign in with SSO using the same (verified) email address."
              : first(params.imported) === "1"
                ? "Library imported. Sign in with your existing account."
                : null
          }
        />
      </CardContent>
    </Card>
  );
}
