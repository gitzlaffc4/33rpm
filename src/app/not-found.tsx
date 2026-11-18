import { Disc3 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Disc3 className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">That record isn&apos;t on any shelf here.</p>
      <Button asChild>
        <Link href="/library">Back to your library</Link>
      </Button>
    </main>
  );
}
