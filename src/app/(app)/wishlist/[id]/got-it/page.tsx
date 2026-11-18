import { ArrowLeft, PenLine, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { Cover } from "@/components/catalog/cover";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMasterPage } from "@/db/repos/catalog";
import { getWishlistItem } from "@/db/repos/wishlist";
import { FORMAT_LABEL } from "@/lib/catalog/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Got it" };

export default function GotItPage({ params }: PageProps<"/wishlist/[id]/got-it">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
      <GotIt params={params} />
    </Suspense>
  );
}

/**
 * "Got it": a release-targeted item goes straight to the copy form; an "any edition" item
 * first asks which pressing you got.
 */
async function GotIt({ params }: Pick<PageProps<"/wishlist/[id]/got-it">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getWishlistItem(user.id, id);
  if (!item) notFound();
  if (item.releaseId)
    redirect(`/album/${item.masterId}/add-copy?release=${item.releaseId}&wish=${item.id}`);
  const page = await getMasterPage(user.id, item.masterId);
  const q = encodeURIComponent(`${item.artist} ${item.title}`);
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/wishlist">
          <ArrowLeft aria-hidden /> Wishlist
        </Link>
      </Button>
      <PageHeader
        title={`Which ${item.title} did you get?`}
        description="Pick the exact pressing so its details are right."
      />
      {page && page.releases.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {page.releases.map((r) => (
            <li key={r.id}>
              <Link
                href={`/album/${item.masterId}/add-copy?release=${r.id}&wish=${item.id}`}
                className="flex items-center gap-3 p-3 hover:bg-accent/50"
              >
                <Cover imageId={r.coverImageId} alt="" className="size-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.formatSummary}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {[r.label, r.catalogNumber, r.country, r.releaseYear]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Badge variant="outline">{FORMAT_LABEL[r.format]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/add?q=${q}&wish=${item.id}`}>
            <Search aria-hidden /> Search all editions
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/scan?wish=${item.id}`}>Scan its barcode</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/add/manual?master=${item.masterId}&wish=${item.id}`}>
            <PenLine aria-hidden /> Enter manually
          </Link>
        </Button>
      </div>
    </div>
  );
}
