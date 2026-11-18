import { CopyPlus, ExternalLink, Layers, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/catalog/action-buttons";
import { ProviderAttribution } from "@/components/catalog/attribution";
import { Cover } from "@/components/catalog/cover";
import { Tracklist } from "@/components/catalog/tracklist";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMasterPage } from "@/db/repos/catalog";
import { wishlistFor } from "@/db/repos/wishlist";
import { WantButtons } from "@/components/catalog/want-buttons";
import { wantRelease } from "@/lib/catalog/wishlist-actions";
import { refreshReleaseMetadata } from "@/lib/catalog/actions";
import { FORMAT_LABEL, formatPrice } from "@/lib/catalog/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Album" };

export default function AlbumPage({ params, searchParams }: PageProps<"/album/[id]">) {
  return (
    <Suspense
      fallback={<div className="h-[70vh] animate-pulse rounded-xl bg-muted/40" aria-busy="true" />}
    >
      <Album params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type PageData = NonNullable<Awaited<ReturnType<typeof getMasterPage>>>;
type ReleaseData = PageData["releases"][number];

async function Album({ params, searchParams }: PageProps<"/album/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const page = await getMasterPage(user.id, id);
  if (!page) notFound();
  const { master, releases } = page;
  const wishes = await wishlistFor(user.id, {
    masterIds: [master.id],
    releaseIds: releases.map((r) => r.id),
  });
  const masterWish = wishes.find((w) => w.masterId === master.id);
  const releaseWish = (rid: string) => wishes.find((w) => w.releaseId === rid);
  const owned = releases.filter((r) => r.copies.length);
  const others = releases.filter((r) => !r.copies.length);
  const hero = owned[0] ?? releases[0];
  const coverId = master.coverImageId ?? releases.find((r) => r.coverImageId)?.coverImageId ?? null;
  const copyCount = owned.reduce((n, r) => n + r.copies.length, 0);
  const differentEdition = `/add?q=${encodeURIComponent(`${master.artist} ${master.title}`)}`;

  return (
    <article className="space-y-8">
      {typeof sp.added === "string" && (
        <Alert variant="success">
          <AlertDescription>Added to your collection.</AlertDescription>
        </Alert>
      )}
      <header className="grid gap-6 md:grid-cols-[minmax(0,20rem)_1fr] md:items-end">
        <Cover
          imageId={coverId}
          alt={`${master.title} cover`}
          size={1200}
          className="w-full max-w-sm"
          priority
        />
        <div className="space-y-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Album
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{master.title}</h1>
          <p className="text-lg">
            {master.artists.map((a, i) => (
              <span key={a.id}>
                <Link href={`/library?view=albums&artist=${a.id}`} className="hover:underline">
                  {a.name}
                </Link>
                {i < master.artists.length - 1 ? a.joinPhrase || ", " : ""}
              </span>
            ))}
            {master.year && <span className="text-muted-foreground"> · {master.year}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {[...master.genres, ...master.styles].slice(0, 6).map((g) => (
              <Badge key={g} variant="secondary" className="font-normal">
                {g}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {copyCount
              ? `${copyCount} ${copyCount === 1 ? "copy" : "copies"} on your shelves`
              : "Not in your collection"}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="secondary">
              <Link href={differentEdition}>
                <Layers aria-hidden /> Add a different edition
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/add/manual?master=${master.id}`}>Enter an edition manually</Link>
            </Button>
          </div>
          {releases[0] && (
            <WantButtons
              wantMaster={wantRelease.bind(null, releases[0].id, "master")}
              wished={masterWish ? { id: masterWish.id, target: "master" } : null}
            />
          )}
          <ExternalLinks master={master} />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="copies-heading" className="space-y-4">
          <h2 id="copies-heading" className="text-xl font-semibold">
            My copies
          </h2>
          {owned.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {owned.map((r) => (
            <ReleaseCard key={r.id} r={r} masterId={master.id} wishId={releaseWish(r.id)?.id} />
          ))}
          {others.length > 0 && (
            <>
              <h2 className="pt-4 text-xl font-semibold">Other editions in the catalog</h2>
              {others.map((r) => (
                <ReleaseCard key={r.id} r={r} masterId={master.id} wishId={releaseWish(r.id)?.id} />
              ))}
            </>
          )}
        </section>
        {hero && (
          <aside aria-labelledby="tracks-heading" className="space-y-3">
            <h2 id="tracks-heading" className="text-xl font-semibold">
              Tracklist
            </h2>
            <Tracklist tracks={hero.tracklist} />
          </aside>
        )}
      </div>
      <ProviderAttribution providers={releases.map((r) => r.dataSource)} />
    </article>
  );
}

function ExternalLinks({ master }: { master: PageData["master"] }) {
  const links = [
    master.discogsMasterId && [
      "Discogs",
      `https://www.discogs.com/master/${master.discogsMasterId}`,
    ],
    master.musicbrainzReleaseGroupId && [
      "MusicBrainz",
      `https://musicbrainz.org/release-group/${master.musicbrainzReleaseGroupId}`,
    ],
  ].filter(Boolean) as [string, string][];
  if (!links.length) return null;
  return (
    <p className="flex flex-wrap gap-4 text-sm">
      {links.map(([name, href]) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          {name} <ExternalLink className="size-3" aria-hidden />
        </a>
      ))}
    </p>
  );
}

function releaseUrl(r: ReleaseData) {
  if (r.discogsReleaseId)
    return ["Discogs", `https://www.discogs.com/release/${r.discogsReleaseId}`];
  if (r.musicbrainzReleaseId)
    return ["MusicBrainz", `https://musicbrainz.org/release/${r.musicbrainzReleaseId}`];
  return null;
}

function ReleaseCard({
  r,
  masterId,
  wishId,
}: {
  r: ReleaseData;
  masterId: string;
  wishId?: string;
}) {
  const meta = [r.label, r.catalogNumber, r.country, r.releaseYear].filter(Boolean).join(" · ");
  const link = releaseUrl(r);
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex gap-4">
        <Cover imageId={r.coverImageId} alt="" className="size-16 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{FORMAT_LABEL[r.format]}</Badge>
            <span className="text-sm font-medium">{r.formatSummary}</span>
          </div>
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
          {r.barcodes.length > 0 && (
            <p className="text-xs text-muted-foreground">Barcode {r.barcodes.join(", ")}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 text-xs">
            {link && (
              <a
                href={link[1]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {link[0]} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            {r.dataSource === "manual" && (
              <span className="text-muted-foreground">Manual entry</span>
            )}
          </div>
        </div>
      </div>
      {r.copies.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {r.copies.map((c, i) => (
            <li key={c.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">
                  Copy {i + 1}
                  {(c.mediaCondition || c.sleeveCondition) && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {c.mediaCondition ?? "—"}/{c.sleeveCondition ?? "—"}
                    </span>
                  )}
                </p>
                <p className="truncate text-muted-foreground">
                  {[c.location, formatPrice(c.priceMinor, c.currency), c.acquiredOn, c.source]
                    .filter(Boolean)
                    .join(" · ") || "No details yet"}
                </p>
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/copy/${c.id}`} aria-label={`Edit copy ${i + 1}`}>
                  <Pencil aria-hidden /> Edit
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={r.copies.length ? "outline" : "secondary"}>
          <Link href={`/album/${masterId}/add-copy?release=${r.id}`}>
            <CopyPlus aria-hidden /> {r.copies.length ? "Add another copy" : "I own this edition"}
          </Link>
        </Button>
        {(r.copies.length === 0 || wishId) && (
          <WantButtons
            wantRelease={wantRelease.bind(null, r.id, "release")}
            wished={wishId ? { id: wishId, target: "release" } : null}
          />
        )}
        {r.dataSource !== "manual" && (
          <ActionButton
            action={refreshReleaseMetadata.bind(null, r.id)}
            label="Refresh metadata"
            pendingLabel="Refreshing…"
            icon="refresh"
          />
        )}
      </div>
    </div>
  );
}
