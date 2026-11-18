import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ActionButton } from "@/components/catalog/action-buttons";
import { Cover } from "@/components/catalog/cover";
import { WishForm } from "@/components/catalog/wish-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getUserSettings } from "@/db/repos/settings";
import { getWishlistItem } from "@/db/repos/wishlist";
import { FORMAT_LABEL } from "@/lib/catalog/format";
import { removeWishlistItem, saveWishlistItem } from "@/lib/catalog/wishlist-actions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Wishlist item" };

export default function WishItemPage({ params }: PageProps<"/wishlist/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted/40" />}>
      <WishItem params={params} />
    </Suspense>
  );
}

async function WishItem({ params }: Pick<PageProps<"/wishlist/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const [item, settings] = await Promise.all([
    getWishlistItem(user.id, id),
    getUserSettings(user.id),
  ]);
  if (!item) notFound();
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/wishlist">
          <ArrowLeft aria-hidden /> Wishlist
        </Link>
      </Button>
      <div className="flex items-center gap-4">
        <Cover imageId={item.coverImageId} alt="" className="size-24 shrink-0" />
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
          <p className="text-muted-foreground">{item.artist}</p>
          <Badge variant={item.target === "master" ? "secondary" : "outline"}>
            {item.target === "master"
              ? "Any edition"
              : [
                  item.format && FORMAT_LABEL[item.format],
                  item.formatSummary,
                  item.label,
                  item.catalogNumber,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {item.status !== "acquired" && (
          <Button asChild>
            <Link href={`/wishlist/${item.id}/got-it`}>Got it</Link>
          </Button>
        )}
        <Button asChild variant="secondary">
          <Link href={`/album/${item.masterId}`}>Album page</Link>
        </Button>
      </div>
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <WishForm
          action={saveWishlistItem.bind(null, item.id)}
          initial={item}
          defaultCurrency={settings.defaultCurrency}
        />
      </section>
      <ActionButton
        action={removeWishlistItem.bind(null, item.id)}
        label="Remove from wishlist"
        variant="destructive"
        icon="delete"
        confirm="Remove this from your wishlist?"
      />
    </div>
  );
}
