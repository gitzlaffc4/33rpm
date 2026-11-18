/**
 * Small, dependency-free charts for the stats page: single-series bars in --chart-1
 * (validated for both themes), values in text ink, a hover/focus tooltip per mark, and
 * a table view for every chart.
 */
import { cn } from "@/lib/utils";

export type Datum = { key: string; label?: string; value: number; display?: string; href?: string };

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/** Horizontal bars for ranked categories (format, genre, label, decade). */
export function BarList({ data, title }: { data: Datum[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="space-y-2">
      <ul className="space-y-1.5" aria-label={title}>
        {data.map((d) => {
          const row = (
            <>
              <span className="w-28 shrink-0 truncate text-sm sm:w-36">{d.label ?? d.key}</span>
              <span className="relative h-5 flex-1">
                <span
                  className="absolute inset-y-0.5 left-0 rounded-r-[4px] bg-chart-1"
                  style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                {d.display ?? d.value.toLocaleString()}
              </span>
            </>
          );
          return (
            <li key={d.key}>
              {d.href ? (
                <a
                  href={d.href}
                  className="flex items-center gap-3 rounded-sm outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {row}
                </a>
              ) : (
                <div className="flex items-center gap-3">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
      <TableView data={data} title={title} />
    </figure>
  );
}

/** Vertical columns over time (one series). */
export function Columns({ data, title }: { data: Datum[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="space-y-2">
      <div
        className="flex h-40 items-end gap-[2px] border-b border-border/60"
        role="list"
        aria-label={title}
      >
        {data.map((d) => (
          <div
            key={d.key}
            role="listitem"
            tabIndex={0}
            aria-label={`${d.label ?? d.key}: ${d.display ?? d.value}`}
            className="group relative flex h-full min-w-2 flex-1 items-end outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {/* Hit target is the full column height; the mark is the bar. */}
            <span
              className="w-full rounded-t-[4px] bg-chart-1"
              style={{ height: `${Math.max(1, (d.value / max) * 100)}%` }}
            />
            <Tip>
              {d.label ?? d.key}: {d.display ?? d.value.toLocaleString()}
            </Tip>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
        <span>{data[0]?.label ?? data[0]?.key}</span>
        {data.length > 1 && <span>{data.at(-1)?.label ?? data.at(-1)?.key}</span>}
      </div>
      <TableView data={data} title={title} />
    </figure>
  );
}

function TableView({ data, title }: { data: Datum[]; title: string }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Table</summary>
      <table className="mt-1 w-full">
        <caption className="sr-only">{title}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key} className="border-t border-border/50">
              <th scope="row" className="py-1 text-left font-normal">
                {d.label ?? d.key}
              </th>
              <td className="py-1 text-right tabular-nums">
                {d.display ?? d.value.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
