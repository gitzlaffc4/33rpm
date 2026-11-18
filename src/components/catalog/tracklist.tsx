import type { Track } from "@/lib/catalog/types";

export function Tracklist({ tracks }: { tracks: Track[] }) {
  if (!tracks.length) return <p className="text-sm text-muted-foreground">No tracklist.</p>;
  return (
    <ol className="divide-y divide-border/60 text-sm">
      {tracks.map((t, i) => (
        <li key={`${t.position}-${i}`} className="flex gap-3 py-2">
          <span className="w-10 shrink-0 text-muted-foreground tabular-nums">{t.position}</span>
          <span className="min-w-0 flex-1">{t.title}</span>
          {t.duration && (
            <span className="shrink-0 text-muted-foreground tabular-nums">{t.duration}</span>
          )}
        </li>
      ))}
    </ol>
  );
}
