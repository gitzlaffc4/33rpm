"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** Something failed while rendering a page: say so plainly and offer a retry. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center"
    >
      <TriangleAlert className="size-10 text-destructive" aria-hidden />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page couldn&apos;t be loaded. If it keeps happening, check the server logs
        {error.digest ? ` (reference ${error.digest})` : ""}.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href="/library">Library</Link>
        </Button>
      </div>
    </div>
  );
}
