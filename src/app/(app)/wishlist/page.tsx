import { Heart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Cover } from "@/components/catalog/cover";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { listWishlist, type WishlistEntry } from "@/db/repos/wishlist";
import { FORMAT_LABEL, formatPrice, PRIORITY_LABEL } from "@/lib/catalog/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Wishlist" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function WishlistPage({ searchParams }: PageProps<"/wishlist">) {
  return (
    <>
      <PageHeader title="Wishlist" description="What you're hunting for." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted/40" />}>
        <Wishlist searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Wishlist({ searchParams }: Pick<PageProps<"/wishlist">, "searchParams">) {
  const user = await requireUser();
  const sp = await searchParams;
  const acquired = one(sp.status) === "acquired";
  const sortParam = one(sp.sort);
  const sort =
    sortParam === "artist" || sortParam === "format" || sortParam === "added"
      ? sortParam
      : "priority";
  const items = await listWishlist(user.id, { status: acquired ? "acquired" : "open", sort });

  const groups: [string, WishlistEntry[]][] = [];
  for (const item of items) {
    const key =
      sort === "priority"
        ? `${PRIORITY_LABEL[item.priority]} priority`
        : sort === "format"
          ? item.format
            ? FORMAT_LABEL[item.format]
            : "Any edition"
          : sort === "artist"
            ? (item.artist[0] ?? "#").toUpperCase()
            : "";
    const last = groups.at(-1);
    if (last && last[0] === key) last[1].push(item);
    else groups.push([key, [item]]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Wishlist status" className="flex gap-1 rounded-lg border p-1">
          {[
            ["Wanted", "/wishlist", !acquired],
            ["Acquired", "/wishlist?status=acquired", acquired],
          ].map(([label, href, active]) => (
            <Link
              key={String(label)}
              href={href as string}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground",
                active && "bg-secondary font-medium text-foreground",
              )}
            >
              {label as string}
            </Link>
          ))}
        </nav>
        <form action="/wishlist" className="flex items-center gap-2">
          {acquired && <input type="hidden" name="status" value="acquired" />}
          <NativeSelect name="sort" defaultValue={sort} aria-label="Sort by" className="w-36">
            <option value="priority">By priority</option>
            <option value="artist">By artist</option>
            <option value="format">By format</option>
            <option value="added">Recently added</option>
          </NativeSelect>
          <Button type="submit" variant="secondary">
            Sort
          </Button>
        </form>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={acquired ? "Nothing acquired yet" : "Nothing on your wishlist yet"}
        >
          <p>
            Use “Want” on a search result, an album page, or when you scan something in a store.
          </p>
          <Button asChild className="mt-4">
            <Link href="/add">Find something</Link>
          </Button>
        </EmptyState>
      ) : (
        groups.map(([label, list]) => (
          <section key={label || "all"} className="space-y-2">
            {label && <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>}
            <ul className="divide-y rounded-lg border">
              {list.map((item) => (
                <li key={item.id}>
                  <WishRow item={item} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function WishRow({ item }: { item: WishlistEntry }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <Link href={`/album/${item.masterId}`} className="shrink-0">
        <Cover imageId={item.coverImageId} alt="" className="size-16" />
      </Link>
      <div className="min-w-0 flex-1 space-y-0.5">
        <Link href={`/wishlist/${item.id}`} className="block truncate font-medium hover:underline">
          {item.title}
        </Link>
        <p className="truncate text-sm text-muted-foreground">{item.artist}</p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs">
          <Badge
            variant={item.target === "master" ? "secondary" : "outline"}
            className="font-normal"
          >
            {item.target === "master"
              ? "Any edition"
              : [item.format && FORMAT_LABEL[item.format], item.catalogNumber]
                  .filter(Boolean)
                  .join(" · ")}
          </Badge>
          {item.status === "ordered" && <Badge>Ordered</Badge>}
          {item.maxPriceMinor !== null && (
            <span className="text-muted-foreground">
              up to {formatPrice(item.maxPriceMinor, item.currency)}
            </span>
          )}
          {item.tags.map((t) => (
            <Badge key={t} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      </div>
      {item.status !== "acquired" ? (
        <Button asChild size="sm">
          <Link href={`/wishlist/${item.id}/got-it`}>Got it</Link>
        </Button>
      ) : (
        item.acquiredCopyId && (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/copy/${item.acquiredCopyId}`}>View copy</Link>
          </Button>
        )
      )}
    </div>
  );
}
