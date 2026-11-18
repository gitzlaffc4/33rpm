import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CopyForm } from "@/components/catalog/copy-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { getMasterPage, listLocations } from "@/db/repos/catalog";
import { getUserSettings } from "@/db/repos/settings";
import { createManualEntry } from "@/lib/catalog/actions";
import { FORMAT_LABEL } from "@/lib/catalog/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Manual entry" };

export default function ManualEntryPage({ searchParams }: PageProps<"/add/manual">) {
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/add">
          <ArrowLeft aria-hidden /> Back to search
        </Link>
      </Button>
      <PageHeader
        title="Manual entry"
        description="For pressings no metadata provider knows about."
      />
      <Suspense
        fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" aria-busy="true" />}
      >
        <ManualEntry searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Field({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

async function ManualEntry({ searchParams }: Pick<PageProps<"/add/manual">, "searchParams">) {
  const user = await requireUser();
  const p = await searchParams;
  const masterParam = typeof p.master === "string" ? p.master : undefined;
  const [locations, settings, master] = await Promise.all([
    listLocations(user.id),
    getUserSettings(user.id),
    masterParam ? getMasterPage(user.id, masterParam) : Promise.resolve(null),
  ]);
  const title = master?.master.title ?? (typeof p.title === "string" ? p.title : "");

  return (
    <CopyForm
      action={createManualEntry}
      locations={locations}
      defaultCurrency={settings.defaultCurrency}
      submitLabel="Add to collection"
    >
      <fieldset className="space-y-4 rounded-xl border bg-card p-4 md:p-6">
        <legend className="px-1 text-lg font-medium">Release</legend>
        {master && (
          <>
            <input type="hidden" name="masterId" value={master.master.id} />
            <p className="text-sm text-muted-foreground">
              Adding a new edition of{" "}
              <strong className="text-foreground">{master.master.title}</strong>.
            </p>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="artist"
            label="Artist"
            required
            defaultValue={master?.master.artist ?? ""}
            autoComplete="off"
          />
          <Field id="title" label="Title" required defaultValue={title} autoComplete="off" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <NativeSelect id="format" name="format" defaultValue="vinyl">
              {Object.entries(FORMAT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Field id="year" label="Year" inputMode="numeric" pattern="\d{4}" placeholder="1977" />
          <Field id="country" label="Country" placeholder="US" />
          <Field id="barcode" label="Barcode" inputMode="numeric" />
        </div>
        <Field
          id="formatDetails"
          label="Format details"
          placeholder="LP, Album, 180g, Gatefold"
          hint="Comma separated."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="label" label="Label" />
          <Field id="catalogNumber" label="Catalog number" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tracklist">Tracklist</Label>
          <Textarea
            id="tracklist"
            name="tracklist"
            rows={5}
            placeholder={"A1 Second Hand News 2:43\nA2 Dreams 4:14"}
            aria-describedby="tracklist-hint"
          />
          <p id="tracklist-hint" className="text-xs text-muted-foreground">
            One track per line. Position and duration are optional.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="releaseNotes">Release notes</Label>
          <Textarea id="releaseNotes" name="releaseNotes" rows={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cover">Cover image</Label>
          <Input id="cover" name="cover" type="file" accept="image/*" />
        </div>
      </fieldset>
    </CopyForm>
  );
}
