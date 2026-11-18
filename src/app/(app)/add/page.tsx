import { PenLine, ScanBarcode, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ProviderAttribution } from "@/components/catalog/attribution";
import { Cover } from "@/components/catalog/cover";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ownershipFor } from "@/db/repos/catalog";
import { FORMAT_LABEL, isFormat } from "@/lib/catalog/format";
import { looksLikeBarcode } from "@/lib/catalog/normalize";
import { searchCatalog, type SearchMode } from "@/lib/providers";
import type { ProviderName, ReleaseCandidate } from "@/lib/providers/types";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add" };

type Params = { q?: string; mode?: string; format?: string };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default function AddPage({ searchParams }: PageProps<"/add">) {
  return (
    <>
      <PageHeader
        title="Add to collection"
        description="Search by artist and title, a barcode, or a catalog number."
      />
      <Suspense fallback={<SearchForm />}>
        <SearchFormFromParams searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SearchFormFromParams({ searchParams }: Pick<PageProps<"/add">, "searchParams">) {
  const p = await searchParams;
  return <SearchForm q={one(p.q)} mode={one(p.mode)} format={one(p.format)} />;
}

function SearchForm({ q = "", mode = "auto", format = "" }: Params) {
  return (
    <form action="/add" role="search" className="space-y-3">
      <div className="flex gap-2">
        <Label htmlFor="q" className="sr-only">
          Search
        </Label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Rumours, 075992731324, BSK 3010…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 text-base"
        />
        <Button type="submit" className="h-11" aria-label="Search">
          <Search aria-hidden />
          <span className="hidden sm:inline">Search</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40 space-y-1">
          <Label htmlFor="mode" className="text-xs text-muted-foreground">
            Search by
          </Label>
          <NativeSelect id="mode" name="mode" defaultValue={mode}>
            <option value="auto">Auto-detect</option>
            <option value="text">Artist / title</option>
            <option value="barcode">Barcode</option>
            <option value="catno">Catalog number</option>
          </NativeSelect>
        </div>
        <div className="w-36 space-y-1">
          <Label htmlFor="format" className="text-xs text-muted-foreground">
            Format
          </Label>
          <NativeSelect id="format" name="format" defaultValue={format}>
            <option value="">Any format</option>
            {Object.entries(FORMAT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button asChild variant="secondary" className="ml-auto">
          <Link href="/scan">
            <ScanBarcode aria-hidden /> Scan
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/add/manual">
            <PenLine aria-hidden /> Enter manually
          </Link>
        </Button>
      </div>
    </form>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/add">, "searchParams">) {
  const user = await requireUser();
  const p = await searchParams;
  const q = (one(p.q) ?? "").trim();
  if (!q) {
    return (
      <EmptyState icon={Search} title="Find the exact pressing you own">
        <p>
          Barcodes find a specific release fastest. Artist and title searches show every edition, so
          check the format, label, catalog number and country.
        </p>
      </EmptyState>
    );
  }
  const requested = one(p.mode);
  const mode: SearchMode =
    requested === "text" || requested === "barcode" || requested === "catno"
      ? requested
      : looksLikeBarcode(q)
        ? "barcode"
        : "text";
  const fmt = one(p.format);
  const format = isFormat(fmt) ? fmt : undefined;
  const { results, errors } = await searchCatalog(user.id, mode, q, { format });
  const filtered = format && mode !== "text" ? results.filter((r) => r.format === format) : results;

  const owned = new Map<ProviderName, Awaited<ReturnType<typeof ownershipFor>>>();
  for (const provider of ["discogs", "musicbrainz"] as const) {
    const mine = filtered.filter((r) => r.provider === provider);
    if (mine.length) {
      owned.set(
        provider,
        await ownershipFor(
          user.id,
          provider,
          mine.map((r) => r.providerReleaseId),
          mine.flatMap((r) => (r.providerMasterId ? [r.providerMasterId] : [])),
        ),
      );
    }
  }

  return (
    <section aria-label="Search results" className="space-y-3">
      {errors.map((e) => (
        <Alert key={e.provider} variant="destructive">
          <AlertDescription>
            {e.provider === "discogs" ? "Discogs" : "MusicBrainz"} search failed: {e.message}
          </AlertDescription>
        </Alert>
      ))}
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtered.length} result{filtered.length === 1 ? "" : "s"} for “{q}”
        {mode !== "text" && ` (${mode === "barcode" ? "barcode" : "catalog number"})`}
      </p>
      {filtered.length === 0 ? (
        <EmptyState icon={Search} title="Nothing found">
          <p>Try fewer words, a different mode, or add it by hand.</p>
          <Button asChild variant="secondary" className="mt-4">
            <Link href={`/add/manual?title=${encodeURIComponent(q)}`}>Enter manually</Link>
          </Button>
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {filtered.map((r) => (
            <li key={`${r.provider}:${r.providerReleaseId}`}>
              <CandidateRow r={r} own={owned.get(r.provider)} />
            </li>
          ))}
        </ul>
      )}
      <ProviderAttribution providers={[...new Set(filtered.map((r) => r.provider))]} />
    </section>
  );
}

function CandidateRow({
  r,
  own,
}: {
  r: ReleaseCandidate;
  own?: Awaited<ReturnType<typeof ownershipFor>>;
}) {
  const ownedCopies = own?.releases.get(r.providerReleaseId) ?? 0;
  const albumOwned =
    !ownedCopies && r.providerMasterId ? own?.masters.has(r.providerMasterId) : false;
  const meta = [r.label, r.catalogNumber, r.country, r.year].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/add/${r.provider}/${encodeURIComponent(r.providerReleaseId)}`}
      className="flex gap-3 p-3 outline-none hover:bg-accent/50 focus-visible:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:gap-4"
    >
      <Cover remoteUrl={r.thumbUrl} alt="" className="size-16 shrink-0 sm:size-20" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium">{r.title}</p>
        <p className="truncate text-sm text-muted-foreground">{r.artist}</p>
        <p className="truncate text-xs text-muted-foreground">{r.formatSummary}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant="outline">{FORMAT_LABEL[r.format]}</Badge>
        <Badge variant="secondary" className="font-normal">
          {r.provider === "discogs" ? "Discogs" : "MusicBrainz"}
        </Badge>
        {ownedCopies > 0 && <Badge>Owned ×{ownedCopies}</Badge>}
        {albumOwned && <Badge variant="outline">Album in library</Badge>}
      </div>
    </Link>
  );
}
