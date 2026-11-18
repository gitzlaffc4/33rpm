import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";

import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getEnv } from "@/env";
import { getAuth, LOCAL_PROVIDER_ID, OIDC_PROVIDER_ID } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { discogsTokenStatus } from "@/lib/discogs-token";
import { getCurrentSession, requireUser } from "@/lib/session";
import { getUserSettings } from "@/db/repos/settings";
import { AboutSection } from "./about-section";
import { DiscogsSection } from "./discogs-section";
import { PreferencesSection } from "./preferences-section";
import { ProfileSection } from "./profile-section";
import { ChangePasswordForm, ConnectSso, OtherSessions } from "./security-section";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/settings">) {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent searchParams={searchParams} />
      </Suspense>
      {/* Build info is static, so it's part of the prerendered shell. */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
          <CardDescription>33rpm build information.</CardDescription>
        </CardHeader>
        <CardContent>
          <AboutSection />
        </CardContent>
      </Card>
    </>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading settings">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-xl bg-muted/50" />
      ))}
    </div>
  );
}

async function SettingsContent({ searchParams }: Pick<PageProps<"/settings">, "searchParams">) {
  const user = await requireUser();
  const params = await searchParams;
  const env = getEnv();
  const auth = getAuth();
  const h = await headers();

  const [accounts, sessions, current] = await Promise.all([
    auth.api.listUserAccounts({ headers: h }),
    auth.api.listSessions({ headers: h }),
    getCurrentSession(),
  ]);
  const settings = await getUserSettings(user.id);
  const providers = new Set(accounts.map((a) => a.providerId));
  const hasPassword = providers.has(LOCAL_PROVIDER_ID);
  const ssoLinked = providers.has(OIDC_PROVIDER_ID);
  const methods = [
    ...(hasPassword ? ["Password"] : []),
    ...(ssoLinked ? [env.OIDC_PROVIDER_NAME] : []),
  ];
  const otherSessions = sessions.filter((s) => s.token !== current?.session.token).length;
  const linkError = authErrorMessage(typeof params.error === "string" ? params.error : null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileSection name={user.name} email={user.email} methods={methods} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Password, single sign-on and active sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {hasPassword && env.AUTH_LOCAL_LOGIN && (
            <>
              <ChangePasswordForm />
              <Separator />
            </>
          )}
          {env.OIDC_ENABLED && (
            <>
              <ConnectSso
                providerId={OIDC_PROVIDER_ID}
                providerName={env.OIDC_PROVIDER_NAME}
                linked={ssoLinked}
                error={linkError}
              />
              <Separator />
            </>
          )}
          <OtherSessions count={otherSessions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discogs</CardTitle>
          <CardDescription>
            Optional. With a token, 33rpm searches Discogs first and falls back to MusicBrainz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiscogsSection status={await discogsTokenStatus(user.id)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesSection defaultCurrency={settings.defaultCurrency} theme={settings.theme} />
        </CardContent>
      </Card>

      <div className="flex justify-end md:hidden">
        <SignOutButton />
      </div>
    </div>
  );
}
