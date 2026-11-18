"use client";

/* eslint-disable @next/next/no-img-element -- images come from our own /api/images routes */
import Link from "next/link";

import { WantButtons } from "@/components/catalog/want-buttons";
import { Button } from "@/components/ui/button";
import type { CheckResult } from "@/lib/catalog/check";
import { wantProviderRelease, wantRelease } from "@/lib/catalog/wishlist-actions";
import { cn } from "@/lib/utils";

const VERDICT: Record<CheckResult["verdict"], { title: string; className: string }> = {
  owned: { title: "You own this", className: "border-success/60 bg-success/10" },
  wanted: { title: "On your wishlist", className: "border-primary/70 bg-primary/10" },
  "owned-other-edition": {
    title: "You own another edition",
    className: "border-border bg-secondary/50",
  },
  new: { title: "Not in your collection", className: "border-border bg-card" },
  unknown: { title: "Barcode not found", className: "border-dashed border-border bg-card" },
};

export function CheckResultCard({ r }: { r: CheckResult }) {
  const v = VERDICT[r.verdict];
  const src = r.imageId
    ? `/api/images/${r.imageId}?size=600`
    : r.thumbUrl
      ? `/api/images/remote?url=${encodeURIComponent(r.thumbUrl)}`
      : null;
  const c = r.candidate;
  const addHref = r.releaseId
    ? `/album/${r.masterId}/add-copy?release=${r.releaseId}`
    : c
      ? `/add/${c.provider}/${encodeURIComponent(c.providerReleaseId)}`
      : `/add/manual?barcode=${r.barcode}`;
  const want = r.releaseId
    ? {
        wantRelease: wantRelease.bind(null, r.releaseId, "release"),
        wantMaster: wantRelease.bind(null, r.releaseId, "master"),
      }
    : c
      ? {
          wantRelease: wantProviderRelease.bind(null, c.provider, c.providerReleaseId, "release"),
          wantMaster: wantProviderRelease.bind(null, c.provider, c.providerReleaseId, "master"),
        }
      : null;
  return (
    <article
      className={cn("space-y-3 rounded-xl border-2 p-4", v.className)}
      aria-label={`${v.title}: ${r.barcode}`}
    >
      <p className="text-lg font-semibold">{v.title}</p>
      <div className="flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded bg-secondary">
          {src && <img src={src} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{r.title ?? r.barcode}</p>
          {r.artist && <p className="truncate text-sm text-muted-foreground">{r.artist}</p>}
          <p className="truncate text-xs text-muted-foreground">
            {[r.formatSummary, r.barcode].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {r.verdict === "owned" &&
          `${r.copies} ${r.copies === 1 ? "copy" : "copies"} of this pressing${r.editionCopies > r.copies ? `, ${r.editionCopies} of the album in total` : ""}.`}
        {r.verdict === "wanted" &&
          (r.wish?.target === "release"
            ? "You want this exact pressing."
            : "You want any edition of this album.")}
        {r.verdict === "owned-other-edition" && `${r.editionCopies} copy of a different pressing.`}
        {r.error && `Lookup failed: ${r.error}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {r.masterId && r.verdict !== "new" && (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/album/${r.masterId}`}>Album</Link>
          </Button>
        )}
        {r.verdict === "wanted" && r.wish && (
          <Button asChild size="sm">
            <Link
              href={
                r.wish.target === "release"
                  ? `/wishlist/${r.wish.id}/got-it`
                  : `${addHref}${addHref.includes("?") ? "&" : "?"}wish=${r.wish.id}`
              }
            >
              Got it
            </Link>
          </Button>
        )}
        {r.verdict !== "wanted" && r.verdict !== "unknown" && (
          <Button asChild size="sm" variant={r.verdict === "owned" ? "outline" : "default"}>
            <Link href={addHref}>
              {r.verdict === "owned" ? "Add another copy" : "Add to collection"}
            </Link>
          </Button>
        )}
        {r.verdict === "unknown" && (
          <Button asChild size="sm" variant="secondary">
            <Link href={addHref}>Enter manually</Link>
          </Button>
        )}
      </div>
      {want && (r.verdict === "new" || r.verdict === "owned-other-edition") && (
        <WantButtons {...want} />
      )}
    </article>
  );
}
