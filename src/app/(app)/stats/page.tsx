import { ChartColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Cover } from "@/components/catalog/cover";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { BarList, Columns, StatTile } from "@/components/stats/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentCopies } from "@/db/repos/catalog";
import { collectionStats } from "@/db/repos/stats";
import { FORMAT_LABEL, formatPrice } from "@/lib/catalog/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage() {
  return (
    <>
      <PageHeader title="Stats" description="Your collection by the numbers." />
      <Suspense
        fallback={
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        }
      >
        <Stats />
      </Suspense>
    </>
  );
}

async function Stats() {
  const user = await requireUser();
  const [s, recent] = await Promise.all([collectionStats(user.id), listRecentCopies(user.id, 8)]);
  if (s.copies === 0) {
    return (
      <EmptyState icon={ChartColumn} title="No stats yet">
        <p>Add a few items and this page will fill up.</p>
        <Button asChild className="mt-4">
          <Link href="/add">Add something</Link>
        </Button>
      </EmptyState>
    );
  }
  const money = (minor: number, currency: string) => formatPrice(minor, currency);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Copies" value={s.copies.toLocaleString()} />
        <StatTile label="Albums" value={s.albums.toLocaleString()} />
        <StatTile label="Artists" value={s.artists.toLocaleString()} />
        <StatTile
          label="Spent"
          value={s.totals[0] ? money(s.totals[0].count, s.totals[0].key) : "—"}
          hint={
            s.totals.length > 1
              ? `+ ${s.totals
                  .slice(1)
                  .map((t) => money(t.count, t.key))
                  .join(", ")}`
              : `${s.priced} of ${s.copies} copies priced`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Formats</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              title="Copies by format"
              data={s.formats.map((f) => ({
                key: f.key,
                label: FORMAT_LABEL[f.key],
                value: f.count,
                href: `/library?format=${f.key}`,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Decades</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              title="Copies by decade"
              data={s.decades.map((d) => ({
                key: d.key,
                value: d.count,
                href: `/library?decade=${d.key.slice(0, 4)}`,
              }))}
            />
          </CardContent>
        </Card>
        {s.genres.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top genres</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                title="Copies by genre"
                data={s.genres.map((g) => ({
                  key: g.key,
                  value: g.count,
                  href: `/library?genre=${encodeURIComponent(g.key)}`,
                }))}
              />
            </CardContent>
          </Card>
        )}
        {s.labels.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top labels</CardTitle>
            </CardHeader>
            <CardContent>
              <BarList
                title="Copies by label"
                data={s.labels.map((l) => ({ key: l.key, value: l.count }))}
              />
            </CardContent>
          </Card>
        )}
        {s.spendByYear.length > 0 && s.mainCurrency && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Spend per year ({s.mainCurrency})</CardTitle>
            </CardHeader>
            <CardContent>
              <Columns
                title={`Spend per year in ${s.mainCurrency}`}
                data={s.spendByYear.map((y) => ({
                  key: y.key,
                  value: y.count,
                  display: money(y.count, s.mainCurrency!),
                }))}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently added</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-4 gap-3 md:grid-cols-8">
            {recent.map((r) => (
              <li key={r.copyId}>
                <Link href={`/album/${r.masterId}`} title={`${r.artist} — ${r.title}`}>
                  <Cover imageId={r.coverImageId} alt={`${r.artist} — ${r.title}`} />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
