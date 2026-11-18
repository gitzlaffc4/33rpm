import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ProviderAttribution } from "@/components/catalog/attribution";
import { CopyForm } from "@/components/catalog/copy-form";
import { Cover } from "@/components/catalog/cover";
import { Tracklist } from "@/components/catalog/tracklist";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { findReleaseByProviderId, listLocations, ownershipFor } from "@/db/repos/catalog";
import { getUserSettings } from "@/db/repos/settings";
import { addCopyFromProvider } from "@/lib/catalog/actions";
import { FORMAT_LABEL } from "@/lib/catalog/format";
import { fetchReleaseDetail, ProviderError } from "@/lib/providers";
import { artistDisplay } from "@/lib/providers/types";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add release" };

export default function AddReleasePage({ params }: PageProps<"/add/[provider]/[id]">) {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/add">
          <ArrowLeft aria-hidden /> Back to search
        </Link>
      </Button>
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />}
      >
        <AddRelease params={params} />
      </Suspense>
    </>
  );
}

async function AddRelease({ params }: Pick<PageProps<"/add/[provider]/[id]">, "params">) {
  const user = await requireUser();
  const { provider, id } = await params;
  if (provider !== "discogs" && provider !== "musicbrainz") notFound();
  const providerId = decodeURIComponent(id);

  let detail;
  try {
    detail = await fetchReleaseDetail(user.id, provider, providerId);
  } catch (e) {
    if (!(e instanceof ProviderError)) throw e;
    if (e.status === 404) notFound();
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load this release</AlertTitle>
        <AlertDescription>{e.message}. Try again in a moment.</AlertDescription>
      </Alert>
    );
  }
  const [locations, settings, own, existingId] = await Promise.all([
    listLocations(user.id),
    getUserSettings(user.id),
    ownershipFor(
      user.id,
      provider,
      [providerId],
      detail.master.providerId ? [detail.master.providerId] : [],
    ),
    findReleaseByProviderId(provider, providerId),
  ]);
  const ownedCopies = own.releases.get(providerId) ?? 0;
  const ownedMasterId = detail.master.providerId
    ? own.masters.get(detail.master.providerId)
    : undefined;
  const artist = artistDisplay(detail.artists);
  const facts: [string, string | null][] = [
    ["Format", detail.formatSummary],
    ["Label", detail.label],
    ["Catalog #", detail.catalogNumber],
    ["Country", detail.country],
    ["Released", detail.releaseDate || (detail.year ? String(detail.year) : null)],
    ["Barcode", detail.barcodes.join(", ") || null],
  ];

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-4">
        <Cover
          remoteUrl={detail.coverUrl}
          alt={`${detail.title} cover`}
          className="w-full max-w-sm"
          priority
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{detail.title}</h1>
          <p className="text-lg text-muted-foreground">{artist}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">{FORMAT_LABEL[detail.format]}</Badge>
            {detail.genres.slice(0, 3).map((g) => (
              <Badge key={g} variant="secondary" className="font-normal">
                {g}
              </Badge>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
          {facts
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
        </dl>
        <a
          href={detail.webUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          View on {provider === "discogs" ? "Discogs" : "MusicBrainz"}{" "}
          <ExternalLink className="size-3" aria-hidden />
        </a>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Tracklist ({detail.tracklist.length})
          </summary>
          <div className="mt-2">
            <Tracklist tracks={detail.tracklist} />
          </div>
        </details>
        <ProviderAttribution providers={[provider]} />
      </div>

      <div className="space-y-6">
        {ownedCopies > 0 ? (
          <Alert>
            <TriangleAlert aria-hidden />
            <AlertTitle>
              You already own {ownedCopies === 1 ? "a copy" : `${ownedCopies} copies`} of this exact
              release
            </AlertTitle>
            <AlertDescription>
              <p>
                Adding again creates another copy.{" "}
                {ownedMasterId && (
                  <Link href={`/album/${ownedMasterId}`} className="underline underline-offset-2">
                    See it in your library
                  </Link>
                )}
              </p>
            </AlertDescription>
          </Alert>
        ) : ownedMasterId ? (
          <Alert>
            <AlertTitle>You have another edition of this album</AlertTitle>
            <AlertDescription>
              <Link href={`/album/${ownedMasterId}`} className="underline underline-offset-2">
                Compare with the edition you own
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
        <section
          aria-labelledby="copy-heading"
          className="space-y-4 rounded-xl border bg-card p-4 md:p-6"
        >
          <h2 id="copy-heading" className="text-lg font-medium">
            Your copy
          </h2>
          <CopyForm
            action={addCopyFromProvider.bind(null, provider, providerId)}
            locations={locations}
            defaultCurrency={settings.defaultCurrency}
            submitLabel={existingId && ownedCopies ? "Add another copy" : "Add to collection"}
          />
        </section>
      </div>
    </div>
  );
}
