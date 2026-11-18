import { ArrowLeft, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CsvImporter } from "@/components/data/csv-importer";
import { DiscogsImport } from "@/components/data/discogs-import";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/env";
import { discogsTokenStatus } from "@/lib/discogs-token";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Import & export" };

export default function DataPage() {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/settings">
          <ArrowLeft aria-hidden /> Settings
        </Link>
      </Button>
      <PageHeader title="Import & export" description="Bring your existing catalog in, and take your data anywhere." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
        <Data />
      </Suspense>
    </>
  );
}

async function Data() {
  const user = await requireUser();
  const status = await discogsTokenStatus(user.id);
  const env = getEnv();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Discogs</CardTitle>
          <CardDescription>
            Import your Discogs collection and wantlist. Running it again only adds what&apos;s new and
            updates conditions and notes that changed; nothing is duplicated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiscogsImport hasToken={status.source === "settings" || status.source === "env"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV import</CardTitle>
          <CardDescription>From another app or a spreadsheet, with column matching.</CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImporter />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>Your collection and wishlist, in open formats.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[
            ["/api/export/collection.csv", "Collection (CSV)"],
            ["/api/export/wishlist.csv", "Wishlist (CSV)"],
            ["/api/export/library.json", "Everything (JSON)"],
          ].map(([href, label]) => (
            <Button key={href} asChild variant="secondary">
              <a href={href} download>
                <Download aria-hidden /> {label}
              </a>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backups</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {env.DATABASE_DIALECT === "sqlite" ? (
            <p>
              {env.BACKUP_INTERVAL_HOURS > 0
                ? `A snapshot of the database is written every ${env.BACKUP_INTERVAL_HOURS} hours to the backups folder in your data volume; the newest ${env.BACKUP_KEEP} are kept.`
                : "Automatic snapshots are off (BACKUP_INTERVAL_HOURS=0)."}{" "}
              Back up the whole data volume (database and images) to keep everything.
            </p>
          ) : (
            <p>You&apos;re on PostgreSQL: back it up with pg_dump (see the README). Images live in the data volume.</p>
          )}
          <p>A complete, portable JSON backup of every table: <code>docker exec -it 33rpm 33rpm export-json /data/backups/full.json</code></p>
        </CardContent>
      </Card>
    </div>
  );
}
