"use client";

/* eslint-disable @next/next/no-img-element -- images come from our own /api/images routes */
import { Disc3, Heart, MapPin, Search, Tag, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { GlobalSearchResult } from "@/lib/catalog/search";

type Row = { id: string; name: string; href: string; meta: string };

/** As-you-type search across the library, wishlist, artists, tags and locations. */
export function SearchPanel({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const query = q.trim();
      // Keep the URL shareable without adding a history entry per keystroke.
      router.replace(query ? `/search?q=${encodeURIComponent(query)}` : "/search", {
        scroll: false,
      });
      if (!query) {
        setResult(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });
        if (res.ok && id === seq.current) setResult((await res.json()) as GlobalSearchResult);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [q, router]);

  const lists: [string, LucideIcon, Row[]][] = result
    ? [
        [
          "Artists",
          User,
          result.artists.map((a) => ({
            id: a.id,
            name: a.name,
            href: `/library?artist=${a.id}`,
            meta: `${a.albums} album${a.albums === 1 ? "" : "s"}`,
          })),
        ],
        [
          "Wishlist",
          Heart,
          result.wishlist.map((w) => ({
            id: w.id,
            name: `${w.artist} — ${w.title}`,
            href: `/wishlist/${w.id}`,
            meta: w.target === "master" ? "Any edition" : "This pressing",
          })),
        ],
        [
          "Tags",
          Tag,
          result.tags.map((t) => ({
            id: t.id,
            name: t.name,
            href: `/library?tag=${t.id}`,
            meta: "",
          })),
        ],
        [
          "Locations",
          MapPin,
          result.locations.map((l) => ({
            id: l.id,
            name: l.name,
            href: `/library?location=${l.id}`,
            meta: `${l.copies} ${l.copies === 1 ? "copy" : "copies"}`,
          })),
        ],
      ]
    : [];
  const total = result ? result.albums.length + lists.reduce((n, [, , r]) => n + r.length, 0) : 0;

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search
          aria-hidden
          className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artist, title, label, catalog number, barcode, tag…"
          aria-label="Search your collection"
          enterKeyHint="search"
          className="h-12 pl-10 text-base"
        />
      </div>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {loading ? "Searching…" : result ? `${total} result${total === 1 ? "" : "s"}` : ""}
      </p>

      {result && total === 0 && (
        <p className="text-sm">
          Nothing in your collection matches.{" "}
          <Link
            href={`/add?q=${encodeURIComponent(q)}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            Search Discogs/MusicBrainz to add it
          </Link>
        </p>
      )}

      {result && result.albums.length > 0 && (
        <section aria-labelledby="s-albums" className="space-y-2">
          <h2
            id="s-albums"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <Disc3 className="size-4" aria-hidden /> Albums
          </h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {result.albums.map((a) => (
              <li key={a.masterId}>
                <Link href={`/album/${a.masterId}`} className="block space-y-1">
                  <div className="aspect-square overflow-hidden rounded-md bg-secondary">
                    {a.coverImageId && (
                      <img
                        src={`/api/images/${a.coverImageId}?size=600`}
                        alt=""
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.artist}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {lists.map(([label, Icon, rows]) =>
        rows.length ? (
          <section key={label} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Icon className="size-4" aria-hidden /> {label}
            </h2>
            <ul className="divide-y rounded-lg border">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    href={r.href}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-accent/50"
                  >
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.meta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
