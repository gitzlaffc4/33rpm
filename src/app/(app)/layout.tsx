import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import {
  MobileTabBar,
  MobileTabBarList,
  SidebarNav,
  SidebarNavList,
} from "@/components/app-shell/app-nav";
import { UserBadge, UserBadgeSkeleton } from "@/components/app-shell/user-badge";
import { Logo } from "@/components/logo";
import { SearchShortcut } from "@/components/search/search-shortcut";

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
        <Link
          href="/search"
          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <Search className="size-4" aria-hidden /> Search
          <kbd className="ml-auto text-xs">/</kbd>
        </Link>
        <Suspense fallback={<SidebarNavList pathname="" />}>
          <SidebarNav />
        </Suspense>
        <div className="mt-auto">
          <Suspense fallback={<UserBadgeSkeleton />}>
            <UserBadge />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="sticky top-0 z-30 flex min-h-14 items-center border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Link href="/library" aria-label="33rpm home">
            <Logo />
          </Link>
          <Link
            href="/search"
            aria-label="Search"
            className="-mr-2 ml-auto p-2 text-muted-foreground"
          >
            <Search className="size-5" aria-hidden />
          </Link>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 md:px-8 md:py-10"
        >
          {children}
        </main>
      </div>

      <SearchShortcut />
      <Suspense fallback={<MobileTabBarList pathname="" />}>
        <MobileTabBar />
      </Suspense>
    </div>
  );
}
