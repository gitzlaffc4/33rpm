import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";
import { SignOutButton } from "./sign-out-button";
import { ThemeSync } from "./theme-sync";

/**
 * Validates the session (redirecting to /login if it's invalid), shows who is
 * signed in, and applies their saved theme. Rendered inside <Suspense>.
 */
export async function UserBadge() {
  const user = await requireUser();
  const settings = getUserSettings(user.id);
  return (
    <div className="flex items-center gap-2">
      <ThemeSync theme={settings.theme} />
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold uppercase"
      >
        {user.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <SignOutButton compact />
    </div>
  );
}

export function UserBadgeSkeleton() {
  return (
    <div className="flex items-center gap-2" aria-hidden>
      <span className="size-8 animate-pulse rounded-full bg-muted" />
      <span className="h-8 flex-1 animate-pulse rounded bg-muted" />
    </div>
  );
}
