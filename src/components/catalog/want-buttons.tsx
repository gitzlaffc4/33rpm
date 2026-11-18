"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { WishState } from "@/lib/catalog/wishlist-actions";

/** "Want this pressing" / "Want any edition" buttons. */
export function WantButtons({
  wantRelease,
  wantMaster,
  wished,
}: {
  wantRelease?: () => Promise<WishState>;
  wantMaster?: () => Promise<WishState>;
  /** Already on the wishlist: link to the item instead. */
  wished?: { id: string; target: "master" | "release" } | null;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<WishState>({});
  const id = state.id ?? wished?.id;
  if (id) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <Heart className="size-4 fill-primary text-primary" aria-hidden />
        <span>{state.ok ?? "On your wishlist"}</span>
        <Link href={`/wishlist/${id}`} className="text-primary underline-offset-2 hover:underline">
          Edit
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {wantRelease && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => setState(await wantRelease()))}
        >
          <Heart aria-hidden /> Want this pressing
        </Button>
      )}
      {wantMaster && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => start(async () => setState(await wantMaster()))}
        >
          <Heart aria-hidden /> Want any edition
        </Button>
      )}
      <span role="status" aria-live="polite" className="text-xs text-destructive">
        {state.error ?? ""}
      </span>
    </div>
  );
}
