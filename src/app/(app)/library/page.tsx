import { Disc3, MapPin, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Cover } from "@/components/catalog/cover";
import { AddLocationForm, RenameLocation } from "@/components/catalog/location-row";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  countCopies,
  formatCounts,
  getArtist,
  libraryFacets,
  type Condition,
  listAlbums,
  listArtists,
  listLocations,
  listRecentCopies,
  type AlbumCard,
  type LibraryFilter,
} from "@/db/repos/catalog";
import { addLocation, removeLocation, saveLocationName } from "@/lib/catalog/actions";
import { CONDITIONS } from "@/db/schema/sqlite/catalog";
import { FORMAT_LABEL, FORMAT_ORDER, isFormat } from "@/lib/catalog/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Library" };

const VIEWS = [
  ["albums", "Albums"],
  ["artists", "Artists"],
  ["formats", "Formats"],
  ["locations", "Locations"],
  ["recent", "Recently added"],
] as const;
type View = (typeof VIEWS)[number][0];

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(sp: SP, patch: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    const s = one(v);
    if (s) p.set(k, s);
  }
  const qs = p.toString();
  return qs ? `/library?${qs}` : "/library";
}

export default function LibraryPage({ searchParams }: PageProps<"/library">) {
  return (
    <>
      <PageHeader title="Library" description="Every record, CD and tape on your shelves." />
      <Suspense fallback={<GridSkeleton />}>
        <Library searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      aria-busy="true"
      aria-label="Loading library"
    >
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded-md bg-muted/50" />
      ))}
    </div>
  );
}

async function Library({ searchParams }: Pick<PageProps<"/library">, "searchParams">) {
  const user = await requireUser();
  const sp = await searchParams;
  const view: View = (VIEWS.map((v) => v[0]) as string[]).includes(one(sp.view) ?? "")
    ? (one(sp.view) as View)
    : "albums";

  const total = await countCopies(user.id);
  if (total === 0 && view !== "locations") {
    return (
      <EmptyState icon={Disc3} title="Your library is empty">
        <p>Search or scan to add the exact pressing you own.</p>
        <Button asChild className="mt-4">
          <Link href="/add">Add your first item</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Library views" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1 border-b">
          {VIEWS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={href({}, { view: key === "albums" ? undefined : key })}
                aria-current={view === key ? "page" : undefined}
                className={cn(
                  "-mb-px inline-block border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                  view === key && "border-primary font-medium text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {view === "albums" && <AlbumsView userId={user.id} sp={sp} />}
      {view === "artists" && <ArtistsView userId={user.id} />}
      {view === "formats" && <FormatsView userId={user.id} />}
      {view === "locations" && <LocationsView userId={user.id} />}
      {view === "recent" && <RecentView userId={user.id} />}
    </div>
  );
}

async function AlbumsView({ userId, sp }: { userId: string; sp: SP }) {
  const fmt = one(sp.format);
  const sortParam = one(sp.sort);
  const filter: LibraryFilter = {
    q: one(sp.q),
    format: isFormat(fmt) ? fmt : undefined,
    locationId: one(sp.location),
    artistId: one(sp.artist),
    tagId: one(sp.tag),
    genre: one(sp.genre),
    condition: (CONDITIONS as readonly string[]).includes(one(sp.condition) ?? "")
      ? (one(sp.condition) as Condition)
      : undefined,
    decade: /^\d{4}$/.test(one(sp.decade) ?? "") ? Number(one(sp.decade)) : undefined,
    priceMin: priceParam(one(sp.min)),
    priceMax: priceParam(one(sp.max)),
    sort:
      sortParam === "title" || sortParam === "year" || sortParam === "added" ? sortParam : "artist",
  };
  const [albums, locations, artist, facets] = await Promise.all([
    listAlbums(userId, filter),
    listLocations(userId),
    filter.artistId ? getArtist(filter.artistId) : Promise.resolve(null),
    libraryFacets(userId),
  ]);
  const location = locations.find((l) => l.id === filter.locationId);
  const tag = facets.tags.find((t) => t.id === filter.tagId);
  const moreActive = Boolean(
    filter.tagId ||
    filter.genre ||
    filter.condition ||
    filter.decade ||
    filter.priceMin ||
    filter.priceMax,
  );
  return (
    <div className="space-y-4">
      <form action="/library" role="search" className="grid grid-cols-3 gap-2 md:flex">
        {filter.artistId && <input type="hidden" name="artist" value={filter.artistId} />}
        <div className="relative col-span-3 md:min-w-48 md:flex-1">
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
            placeholder="Filter by artist or title"
            aria-label="Filter"
            enterKeyHint="search"
            className="pl-9"
          />
        </div>
        <NativeSelect
          name="format"
          defaultValue={filter.format ?? ""}
          aria-label="Format"
          className="md:w-32"
        >
          <option value="">All formats</option>
          {FORMAT_ORDER.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="location"
          defaultValue={filter.locationId ?? ""}
          aria-label="Location"
          className="md:w-36"
        >
          <option value="">Anywhere</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          name="sort"
          defaultValue={filter.sort}
          aria-label="Sort by"
          className="md:w-36"
        >
          <option value="artist">Artist</option>
          <option value="title">Title</option>
          <option value="year">Year</option>
          <option value="added">Recently added</option>
        </NativeSelect>
        <Button type="submit" variant="secondary" className="col-span-3 md:col-span-1">
          Apply
        </Button>
        <details className="col-span-3 md:basis-full" open={moreActive}>
          <summary className="cursor-pointer py-1 text-sm text-muted-foreground">
            More filters
          </summary>
          <div className="grid grid-cols-2 gap-2 pt-2 md:grid-cols-6">
            <NativeSelect name="genre" defaultValue={filter.genre ?? ""} aria-label="Genre">
              <option value="">Any genre</option>
              {facets.genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="decade"
              defaultValue={filter.decade ? String(filter.decade) : ""}
              aria-label="Decade"
            >
              <option value="">Any decade</option>
              {facets.decades.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              name="condition"
              defaultValue={filter.condition ?? ""}
              aria-label="Media condition"
            >
              <option value="">Any condition</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="tag" defaultValue={filter.tagId ?? ""} aria-label="Tag">
              <option value="">Any tag</option>
              {facets.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
            <Input
              name="min"
              inputMode="decimal"
              placeholder="Min price"
              aria-label="Minimum price"
              defaultValue={one(sp.min) ?? ""}
            />
            <Input
              name="max"
              inputMode="decimal"
              placeholder="Max price"
              aria-label="Maximum price"
              defaultValue={one(sp.max) ?? ""}
            />
          </div>
        </details>
      </form>
      {(artist || location || filter.format || filter.q || moreActive) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {albums.length} album{albums.length === 1 ? "" : "s"}
          {artist && <Badge variant="secondary">by {artist.name}</Badge>}
          {filter.format && <Badge variant="secondary">{FORMAT_LABEL[filter.format]}</Badge>}
          {location && <Badge variant="secondary">in {location.name}</Badge>}
          {filter.genre && <Badge variant="secondary">{filter.genre}</Badge>}
          {filter.decade && <Badge variant="secondary">{filter.decade}s</Badge>}
          {filter.condition && <Badge variant="secondary">{filter.condition}</Badge>}
          {tag && <Badge variant="secondary">#{tag.name}</Badge>}
          {(filter.priceMin !== undefined || filter.priceMax !== undefined) && (
            <Badge variant="secondary">
              {one(sp.min) || "0"}–{one(sp.max) || "∞"}
            </Badge>
          )}
          <Link href="/library" className="underline underline-offset-2">
            Clear
          </Link>
        </p>
      )}
      {albums.length === 0 ? (
        <EmptyState icon={Search} title="No matches" />
      ) : (
        <AlbumGrid albums={albums} />
      )}
    </div>
  );
}

/** "24.99" → 2499 (2-decimal currencies; filters are approximate across currencies). */
function priceParam(v: string | undefined) {
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

function AlbumGrid({ albums }: { albums: AlbumCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {albums.map((a, i) => (
        <li key={a.masterId}>
          <Link
            href={`/album/${a.masterId}`}
            className="group block space-y-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Cover
              imageId={a.coverImageId}
              alt=""
              priority={i < 10}
              className="transition-transform group-hover:-translate-y-0.5 group-hover:shadow-lg"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{a.title}</p>
              <p className="truncate text-xs text-muted-foreground">{a.artist}</p>
              <p className="truncate text-xs text-muted-foreground">
                {a.formats.map((f) => FORMAT_LABEL[f]).join(" + ")}
                {a.copies > 1 && ` · ${a.copies} copies`}
                {a.year && ` · ${a.year}`}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function ArtistsView({ userId }: { userId: string }) {
  const artists = await listArtists(userId);
  return (
    <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
      {artists.map((a) => (
        <li key={a.id} className="border-b">
          <Link
            href={href({}, { artist: a.id })}
            className="flex items-baseline justify-between gap-3 py-3 hover:text-primary"
          >
            <span className="truncate font-medium">{a.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {a.albums} album{a.albums === 1 ? "" : "s"}
              {a.copies !== a.albums && ` · ${a.copies} copies`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function FormatsView({ userId }: { userId: string }) {
  const counts = await formatCounts(userId);
  const by = new Map(counts.map((c) => [c.format, c.copies]));
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {FORMAT_ORDER.map((f) => (
        <li key={f}>
          <Link
            href={href({}, { format: f })}
            className={cn(
              "flex flex-col gap-1 rounded-xl border bg-card p-5 hover:border-primary",
              !by.get(f) && "pointer-events-none opacity-50",
            )}
            aria-disabled={!by.get(f) || undefined}
          >
            <span className="text-3xl font-semibold tabular-nums">{by.get(f) ?? 0}</span>
            <span className="text-sm text-muted-foreground">{FORMAT_LABEL[f]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function LocationsView({ userId }: { userId: string }) {
  const locations = await listLocations(userId);
  return (
    <div className="space-y-4">
      <AddLocationForm action={addLocation} />
      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title="No locations yet">
          <p>Add shelves, crates or rooms so you can find any record in seconds.</p>
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          {locations.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <Link
                href={href({}, { location: l.id })}
                className="flex items-center gap-2 font-medium hover:text-primary"
              >
                <MapPin className="size-4 text-muted-foreground" aria-hidden />
                {l.name}
                <span className="text-xs font-normal text-muted-foreground">
                  {l.copies} {l.copies === 1 ? "copy" : "copies"}
                </span>
              </Link>
              <RenameLocation
                name={l.name}
                rename={saveLocationName.bind(null, l.id)}
                remove={removeLocation.bind(null, l.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function RecentView({ userId }: { userId: string }) {
  const items = await listRecentCopies(userId, 60);
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((c) => (
        <li key={c.copyId}>
          <Link
            href={`/album/${c.masterId}`}
            className="flex items-center gap-3 p-3 hover:bg-accent/50"
          >
            <Cover imageId={c.coverImageId} alt="" className="size-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.title}</p>
              <p className="truncate text-sm text-muted-foreground">{c.artist}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[c.formatSummary, c.location].filter(Boolean).join(" · ")}
              </p>
            </div>
            <time
              dateTime={c.createdAt.toISOString()}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {fmt.format(c.createdAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
