import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CopyForm } from "@/components/catalog/copy-form";
import { Cover } from "@/components/catalog/cover";
import { Button } from "@/components/ui/button";
import { getReleaseSummary, listLocations } from "@/db/repos/catalog";
import { getUserSettings } from "@/db/repos/settings";
import { addCopyToRelease } from "@/lib/catalog/actions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add a copy" };

export default function AddCopyPage(props: PageProps<"/album/[id]/add-copy">) {
  return (
    <Suspense
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />}
    >
      <AddCopy {...props} />
    </Suspense>
  );
}

async function AddCopy({ params, searchParams }: PageProps<"/album/[id]/add-copy">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const releaseId = typeof sp.release === "string" ? sp.release : "";
  const wishId = typeof sp.wish === "string" ? sp.wish : undefined;
  const release = releaseId ? await getReleaseSummary(releaseId) : null;
  if (!release || release.masterId !== id) notFound();
  const [locations, settings] = await Promise.all([
    listLocations(user.id),
    getUserSettings(user.id),
  ]);
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/album/${id}`}>
          <ArrowLeft aria-hidden /> Back to album
        </Link>
      </Button>
      <div className="flex items-center gap-4">
        <Cover imageId={release.coverImageId} alt="" className="size-20 shrink-0" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{release.title}</h1>
          <p className="text-muted-foreground">{release.artist}</p>
          <p className="text-sm text-muted-foreground">{release.formatSummary}</p>
        </div>
      </div>
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <CopyForm
          action={addCopyToRelease.bind(null, release.id)}
          locations={locations}
          defaultCurrency={settings.defaultCurrency}
          submitLabel="Add copy"
          hidden={{ wishId }}
        />
      </section>
    </div>
  );
}
