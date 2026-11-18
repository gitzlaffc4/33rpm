import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { needsSetup } from "@/lib/setup-code";
import { AuthCardSkeleton } from "../auth-skeleton";
import { getLibraryOffer } from "@/server/library-offer";
import { ImportForm } from "./import-form";
import { SetupForm } from "./setup-form";
import Link from "next/link";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage({ searchParams }: PageProps<"/setup">) {
  return (
    <Suspense fallback={<AuthCardSkeleton />}>
      <SetupCard searchParams={searchParams} />
    </Suspense>
  );
}

async function SetupCard({ searchParams }: Pick<PageProps<"/setup">, "searchParams">) {
  await connection();
  if (!(await needsSetup())) redirect("/login");
  const { fresh } = await searchParams;
  const offer = getLibraryOffer();
  if (offer && fresh !== "1") {
    const name = offer.source.dialect === "pg" ? "PostgreSQL" : "SQLite";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Import existing library</CardTitle>
          <CardDescription>
            Found a {name} library: {offer.summary}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Everything is copied into this database (users, collection, wishlist, settings) and
            checked table by table. The source is only read
            {offer.isDefaultSqlite ? " (afterwards it is renamed, never deleted)" : ""}. You then
            sign in with your existing account.
          </p>
          {offer.source.compatibility === "older-sqlite" && (
            <p className="text-sm text-muted-foreground">
              It was made by an older version; a temporary copy is upgraded during the import.
            </p>
          )}
          {offer.source.compatibility === "older-pg" || offer.source.compatibility === "newer" ? (
            <p className="text-sm text-destructive">
              {offer.source.compatibility === "newer"
                ? "It was made by a newer version of 33rpm. Upgrade 33rpm to import it."
                : "It's on an older schema. Start the old instance once with this version so it upgrades, then try again."}
            </p>
          ) : (
            <ImportForm />
          )}
          <p className="text-center text-sm">
            <Link
              href="/setup?fresh=1"
              className="text-muted-foreground underline underline-offset-2"
            >
              Start fresh instead
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to 33rpm</CardTitle>
        <CardDescription>Create the admin account for this instance.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetupForm />
      </CardContent>
    </Card>
  );
}
