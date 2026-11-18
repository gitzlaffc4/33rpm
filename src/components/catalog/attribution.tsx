import type { ProviderName } from "@/lib/providers/types";

/** Required by the Discogs API terms wherever Discogs data is shown. */
export function ProviderAttribution({ providers }: { providers: (ProviderName | "manual")[] }) {
  const set = new Set(providers);
  if (!set.has("discogs") && !set.has("musicbrainz")) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {set.has("discogs") && (
        <>
          Data provided by{" "}
          <a
            href="https://www.discogs.com"
            className="underline underline-offset-2"
            rel="noreferrer"
            target="_blank"
          >
            Discogs
          </a>
          .{" "}
        </>
      )}
      {set.has("musicbrainz") && (
        <>
          Metadata from{" "}
          <a
            href="https://musicbrainz.org"
            className="underline underline-offset-2"
            rel="noreferrer"
            target="_blank"
          >
            MusicBrainz
          </a>
          , cover art from the{" "}
          <a
            href="https://coverartarchive.org"
            className="underline underline-offset-2"
            rel="noreferrer"
            target="_blank"
          >
            Cover Art Archive
          </a>
          .
        </>
      )}
    </p>
  );
}
