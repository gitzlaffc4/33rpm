import Link from "next/link";
import { Suspense } from "react";

import { MobileTabBar, SidebarNav } from "@/components/app-shell/app-nav";
import { UserBadge, UserBadgeSkeleton } from "@/components/app-shell/user-badge";
import { Logo } from "@/components/logo";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <Link href="/library" className="px-2 py-1" aria-label="33rpm home">
          <Logo className="text-lg" />
        </Link>
        <SidebarNav />
        <div className="mt-auto">
          <Suspense fallback={<UserBadgeSkeleton />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/90 px-4 backdrop-blur md:hidden">
          <Link href="/library" aria-label="33rpm home">
            <Logo />
          </Link>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 md:px-8 md:py-10"
        >
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}
