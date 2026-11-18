import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

import { Logo } from "@/components/logo";
import { ReloadButton } from "./reload-button";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when a page can't be reached. Fully static. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo className="text-xl" />
      <WifiOff className="size-10 text-muted-foreground" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          33rpm can&apos;t reach your server right now. Check your connection (or VPN) and try
          again.
        </p>
      </div>
      <ReloadButton />
    </main>
  );
}
