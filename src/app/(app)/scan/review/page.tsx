import { ArrowLeft, ScanBarcode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ProviderAttribution } from "@/components/catalog/attribution";
import { CopyForm } from "@/components/catalog/copy-form";
import { Cover } from "@/components/catalog/cover";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getReleaseSummary, listLocations } from "@/db/repos/catalog";
import { listOpenScans, type ScanItem } from "@/db/repos/scans";
import { getUserSettings } from "@/db/repos/settings";
import { FORMAT_LABEL } from "@/lib/catalog/format";
import { confirmScans } from "@/lib/catalog/scan-actions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Review scans" };

export default function ReviewPage({ searchParams }: PageProps<"/scan/review">) {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/scan?mode=crate">
          <ArrowLeft aria-hidden /> Back to scanning
        </Link>
      </Button>
      <PageHeader
        title="Review scans"
        description="Matches are selected for you. Pick the right pressing where there's more than one."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
        <Review searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Review({ searchParams }: Pick<PageProps<"/scan/review">, "searchParams">) {
  const user = await requireUser();
  const { added } = await searchParams;
  const addedCount = typeof added === "string" ? Number(added) || 0 : 0;
  const banner = addedCount > 0 && (
    <Alert variant="success">
      <AlertDescription>
        Added {addedCount} {addedCount === 1 ? "item" : "items"} to your collection.{" "}
        <Link href="/library?view=recent" className="underline underline-offset-2">
          See them
        </Link>
      </AlertDescription>
    </Alert>
  );
  const [items, locations, settings] = await Promise.all([
    listOpenScans(user.id),
    listLocations(user.id),
    getUserSettings(user.id),
  ]);
  if (!items.length) {
    return (
      <div className="space-y-6">
        {banner}
        <EmptyState icon={ScanBarcode} title="Nothing to review">
          <p>Scan a crate in crate mode, then come back here.</p>
          <Button asChild className="mt-4">
            <Link href="/scan?mode=crate">Start scanning</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }
  const order = { ambiguous: 0, matched: 1, not_found: 2, error: 3, pending: 4 } as Record<
    string,
    number
  >;
  const sorted = [...items].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  const providers = [...new Set(items.flatMap((i) => i.candidates.map((c) => c.provider)))];
  const addable = items.filter((i) => i.status === "matched" || i.status === "ambiguous").length;

  return (
    <>
      {banner}
      <CopyForm
        action={confirmScans}
        locations={locations}
        defaultCurrency={settings.defaultCurrency}
        submitLabel={`Add selected (${addable})`}
      >
        <ul className="space-y-3">
          {sorted.map((item) => (
            <li key={item.id}>
              <ScanRow item={item} />
            </li>
          ))}
        </ul>
        <ProviderAttribution providers={providers} />
        <p className="text-sm text-muted-foreground">
          The details below apply to every item you add; edit individual copies afterwards.
        </p>
      </CopyForm>
    </>
  );
}

async function ScanRow({ item }: { item: ScanItem }) {
  const name = `pick-${item.id}`;
  if (item.status === "matched" && item.releaseId) {
    const r = await getReleaseSummary(item.releaseId);
    return (
      <fieldset className="rounded-xl border bg-card p-3">
        <legend className="sr-only">Barcode {item.barcode}</legend>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name={name}
            value="local"
            defaultChecked
            className="size-5 accent-primary"
          />
          <Cover imageId={r?.coverImageId} alt="" className="size-14 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{r?.title}</span>
            <span className="block truncate text-sm text-muted-foreground">{r?.artist}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {r?.formatSummary} · {item.barcode} · already in your catalog
            </span>
          </span>
        </label>
      </fieldset>
    );
  }
  if (item.status === "matched" || item.status === "ambiguous") {
    const single = item.status === "matched";
    return (
      <fieldset className="space-y-2 rounded-xl border bg-card p-3">
        <legend className="flex flex-wrap items-center gap-2 px-1 text-sm">
          <span className="font-mono">{item.barcode}</span>
          {single ? (
            <Badge variant="secondary">Match</Badge>
          ) : (
            <Badge>{item.candidates.length} pressings: choose one</Badge>
          )}
        </legend>
        {item.candidates.map((c, i) => (
          <label
            key={`${c.provider}:${c.providerReleaseId}`}
            className="flex items-center gap-3 rounded-lg p-1 has-checked:bg-accent"
          >
            <input
              type={single ? "checkbox" : "radio"}
              name={name}
              value={`${c.provider}:${c.providerReleaseId}`}
              defaultChecked={single && i === 0}
              className="size-5 accent-primary"
            />
            <Cover remoteUrl={c.thumbUrl} alt="" className="size-14 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.title}</span>
              <span className="block truncate text-sm text-muted-foreground">{c.artist}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[
                  FORMAT_LABEL[c.format],
                  c.formatSummary,
                  c.label,
                  c.catalogNumber,
                  c.country,
                  c.year,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </label>
        ))}
        {!single && (
          <label className="flex items-center gap-3 p-1 text-sm text-muted-foreground">
            <input
              type="radio"
              name={name}
              value="skip"
              defaultChecked
              className="size-5 accent-primary"
            />
            Skip for now
          </label>
        )}
      </fieldset>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3 text-sm">
      <span className="font-mono">{item.barcode}</span>
      <span className="text-muted-foreground">
        {item.status === "pending"
          ? "Still looking up…"
          : item.status === "not_found"
            ? "No provider knows this barcode."
            : `Lookup failed${item.error ? `: ${item.error}` : ""}.`}
      </span>
      {item.status !== "pending" && (
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link href={`/add/manual?barcode=${item.barcode}`}>Enter manually</Link>
        </Button>
      )}
    </div>
  );
}
