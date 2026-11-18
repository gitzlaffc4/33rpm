/* eslint-disable @next/next/no-img-element -- served by /api/images */
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/catalog/action-buttons";
import { CopyForm } from "@/components/catalog/copy-form";
import { Cover, coverSrc } from "@/components/catalog/cover";
import { PhotoUpload } from "@/components/catalog/photo-upload";
import { Button } from "@/components/ui/button";
import { getCopy, listLocations } from "@/db/repos/catalog";
import { getUserSettings } from "@/db/repos/settings";
import { removeCopy, removeCopyPhoto, saveCopy, uploadCopyPhoto } from "@/lib/catalog/actions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Edit copy" };

export default function EditCopyPage({ params }: PageProps<"/copy/[id]">) {
  return (
    <Suspense
      fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />}
    >
      <EditCopy params={params} />
    </Suspense>
  );
}

async function EditCopy({ params }: Pick<PageProps<"/copy/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const copy = await getCopy(user.id, id);
  if (!copy) notFound();
  const [locations, settings] = await Promise.all([
    listLocations(user.id),
    getUserSettings(user.id),
  ]);
  const r = copy.release;
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/album/${r.masterId}`}>
          <ArrowLeft aria-hidden /> Back to album
        </Link>
      </Button>
      <div className="flex items-center gap-4">
        <Cover imageId={r.coverImageId} alt="" className="size-20 shrink-0" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Edit copy</h1>
          <p className="truncate text-muted-foreground">
            {r.artist} — {r.title}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {[r.formatSummary, r.label, r.catalogNumber].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4 md:p-6">
        <CopyForm
          action={saveCopy.bind(null, copy.id)}
          locations={locations}
          defaultCurrency={settings.defaultCurrency}
          initial={copy}
          submitLabel="Save changes"
        />
      </section>

      <section
        aria-labelledby="photos-heading"
        className="space-y-4 rounded-xl border bg-card p-4 md:p-6"
      >
        <h2 id="photos-heading" className="text-lg font-medium">
          Photos
        </h2>
        <p className="text-sm text-muted-foreground">
          Photograph wear, inserts, matrix etchings — whatever you want to remember.
        </p>
        {copy.photoIds.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {copy.photoIds.map((pid, i) => (
              <li key={pid} className="space-y-1">
                <a href={coverSrc(pid, 1200)} target="_blank" rel="noreferrer">
                  <img
                    src={coverSrc(pid, 600)}
                    alt={`Photo ${i + 1}`}
                    loading="lazy"
                    className="aspect-square w-full rounded-md object-cover ring-1 ring-border"
                  />
                </a>
                <ActionButton
                  action={removeCopyPhoto.bind(null, copy.id, pid)}
                  label="Remove"
                  icon="delete"
                  confirm="Remove this photo?"
                />
              </li>
            ))}
          </ul>
        )}
        <PhotoUpload action={uploadCopyPhoto.bind(null, copy.id)} />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 p-4">
        <div>
          <h2 className="font-medium">Remove this copy</h2>
          <p className="text-sm text-muted-foreground">
            The release stays in the catalog; only your copy and its photos go.
          </p>
        </div>
        <ActionButton
          action={removeCopy.bind(null, copy.id)}
          label="Delete copy"
          variant="destructive"
          icon="delete"
          confirm="Delete this copy and its photos?"
        />
      </section>
    </div>
  );
}
