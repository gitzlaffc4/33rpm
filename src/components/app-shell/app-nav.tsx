"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

function isActive(pathname: string, item: { href: string; also?: string[] }) {
  return [item.href, ...(item.also ?? [])].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/** Vertical nav for the desktop sidebar. */
export function SidebarNav() {
  return <SidebarNavList pathname={usePathname()} />;
}

/** Static variant (no active item): the Suspense fallback while the URL is unknown. */
export function SidebarNavList({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const { href, label, icon: Icon } = item;
        const active = isActive(pathname, item);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              active && "bg-accent text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar for phones. */
export function MobileTabBar() {
  return <MobileTabBarList pathname={usePathname()} />;
}

export function MobileTabBarList({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const { href, label, icon: Icon, primary } = item;
          const active = isActive(pathname, item);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground outline-none focus-visible:bg-accent",
                  active && "text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center",
                    primary && "size-9 rounded-full bg-primary text-primary-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-5", active && !primary && "text-primary")}
                    aria-hidden
                  />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
