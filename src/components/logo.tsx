import { cn } from "@/lib/utils";

/** "33" record-label mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7">
        <circle cx="16" cy="16" r="15" className="fill-foreground" />
        <circle
          cx="16"
          cy="16"
          r="11"
          fill="none"
          className="stroke-background/25"
          strokeWidth="0.6"
        />
        <circle
          cx="16"
          cy="16"
          r="8.5"
          fill="none"
          className="stroke-background/25"
          strokeWidth="0.6"
        />
        <circle cx="16" cy="16" r="6" className="fill-primary" />
        <circle cx="16" cy="16" r="1.2" className="fill-background" />
      </svg>
      <span>33rpm</span>
    </span>
  );
}
