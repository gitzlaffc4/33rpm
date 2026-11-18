"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { startDiscogsImportAction } from "@/lib/catalog/import-actions";
import type { DiscogsImportReport } from "@/lib/integrations/discogs-import";

type Job = {
  status: "queued" | "running" | "done" | "failed";
  progress: { done: number; total: number | null; step: string };
  report: (Partial<DiscogsImportReport> & Record<string, unknown>) | null;
  error: string | null;
  updatedAt: string;
} | null;

export function DiscogsImport({ hasToken }: { hasToken: boolean }) {
  const [state, action, pending] = useActionState(startDiscogsImportAction, {});
  const [job, setJob] = useState<Job>(null);

  // Load now (and after starting an import), then poll while a job runs.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    const tick = async () => {
      const res = await fetch("/api/jobs/discogs", { cache: "no-store" });
      if (!alive || !res.ok) return;
      const next = (await res.json()) as Job;
      setJob(next);
      if (next && (next.status === "queued" || next.status === "running")) timer = setTimeout(tick, 2000);
    };
    timer = setTimeout(tick, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [state]);

  const active = job?.status === "queued" || job?.status === "running";
  const r = job?.report;
  return (
    <div className="space-y-4">
      {!hasToken && (
        <p className="text-sm text-muted-foreground">
          Add your Discogs personal access token above first (Settings → Discogs).
        </p>
      )}
      <form action={action} className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="sr-only">What to import</legend>
          {[
            ["collection", "Collection (conditions, notes, ratings)"],
            ["wantlist", "Wantlist → wishlist"],
            ["details", "Fetch tracklists and barcodes (slower: about one release per second)"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={name} defaultChecked className="size-4 accent-primary" />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex items-center gap-2">
          <Label htmlFor="foldersAs" className="text-sm">
            Collection folders become
          </Label>
          <NativeSelect id="foldersAs" name="foldersAs" defaultValue="locations" className="w-40">
            <option value="locations">Locations</option>
            <option value="tags">Tags</option>
            <option value="ignore">Nothing</option>
          </NativeSelect>
        </div>
        <Button type="submit" disabled={!hasToken || pending || active}>
          {active ? "Import running…" : job ? "Sync again" : "Import from Discogs"}
        </Button>
        <p role="status" aria-live="polite" className={state.error ? "text-sm text-destructive" : "text-sm text-success"}>
          {state.error ?? state.ok ?? ""}
        </p>
      </form>

      {job && (
        <div className="space-y-1 rounded-lg border p-3 text-sm" aria-live="polite">
          {active && (
            <>
              <p>
                {job.progress.step}
                {job.progress.total ? ` (${job.progress.done}/${job.progress.total})` : "…"}
              </p>
              {job.progress.total ? (
                <progress className="w-full accent-primary" value={job.progress.done} max={job.progress.total} />
              ) : null}
            </>
          )}
          {job.status === "failed" && <p className="text-destructive">Import failed: {job.error}</p>}
          {job.status === "done" && r?.collection && (
            <>
              <p className="font-medium">
                Last sync with Discogs ({r.username}), {new Date(job.updatedAt).toLocaleString()}
              </p>
              <p>
                Collection: {r.collection.added} added, {r.collection.updated} updated, {r.collection.skipped} unchanged
                {r.collection.failed ? `, ${r.collection.failed} failed` : ""}.
              </p>
              {r.wantlist && (
                <p>
                  Wantlist: {r.wantlist.added} added, {r.wantlist.skipped} already on your wishlist
                  {r.wantlist.failed ? `, ${r.wantlist.failed} failed` : ""}.
                </p>
              )}
              {r.details && r.details.fetched + r.details.failed > 0 && (
                <p>
                  Details fetched for {r.details.fetched} releases{r.details.failed ? ` (${r.details.failed} failed)` : ""}.
                </p>
              )}
              {r.errors?.slice(0, 10).map((e) => (
                <p key={e} className="text-xs text-destructive">
                  {e}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
