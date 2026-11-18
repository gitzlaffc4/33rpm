/**
 * Discogs provider (primary when a personal access token is configured).
 * https://www.discogs.com/developers — ~60 req/min authenticated; we honor the
 * X-Discogs-Ratelimit-* headers. UI must show "Data provided by Discogs".
 */
import { z } from "zod";

import { looksLikeBarcode, stripDisambiguation, yearFrom } from "@/lib/catalog/normalize";
import type { Format, Track } from "@/lib/catalog/types";
import { fetchJson, queueFor } from "./http";
import type {
  ArtistCredit,
  MasterDetail,
  MetadataProvider,
  ReleaseCandidate,
  ReleaseDetail,
  SearchOptions,
} from "./types";
import { artistDisplay } from "./types";

const API = "https://api.discogs.com";

const year = z.union([z.number(), z.string()]).nullish();

const SearchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      type: z.string(),
      title: z.string(),
      year: year,
      country: z.string().nullish(),
      format: z.array(z.string()).optional(),
      label: z.array(z.string()).optional(),
      catno: z.string().nullish(),
      barcode: z.array(z.string()).optional(),
      master_id: z.number().nullish(),
      thumb: z.string().nullish(),
      cover_image: z.string().nullish(),
    }),
  ),
});

const ArtistsSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string(),
    anv: z.string().nullish(),
    join: z.string().nullish(),
  }),
);

const ReleaseSchema = z.object({
  id: z.number(),
  title: z.string(),
  artists: ArtistsSchema,
  year: z.number().nullish(),
  released: z.string().nullish(),
  country: z.string().nullish(),
  formats: z
    .array(
      z.object({
        name: z.string(),
        qty: z.string().nullish(),
        descriptions: z.array(z.string()).optional(),
        text: z.string().nullish(),
      }),
    )
    .optional(),
  labels: z.array(z.object({ name: z.string(), catno: z.string().nullish() })).optional(),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  tracklist: z
    .array(
      z.object({
        position: z.string().nullish(),
        title: z.string(),
        duration: z.string().nullish(),
        type_: z.string().nullish(),
      }),
    )
    .optional(),
  genres: z.array(z.string()).optional(),
  styles: z.array(z.string()).optional(),
  notes: z.string().nullish(),
  images: z.array(z.object({ type: z.string(), uri: z.string() })).optional(),
  master_id: z.number().nullish(),
  uri: z.string().nullish(),
});

const MasterSchema = z.object({
  id: z.number(),
  title: z.string(),
  year: z.number().nullish(),
  artists: ArtistsSchema,
  genres: z.array(z.string()).optional(),
  styles: z.array(z.string()).optional(),
});

export type DiscogsSearch = z.infer<typeof SearchSchema>;
export type DiscogsRelease = z.infer<typeof ReleaseSchema>;

export function discogsFormat(name: string | undefined): Format {
  const f = (name ?? "").toLowerCase();
  if (f.includes("vinyl") || f.includes("lathe") || f.includes("flexi")) return "vinyl";
  if (/\bcd|sacd|cdr\b/.test(f)) return "cd";
  if (f.includes("cassette") || f.includes("tape")) return "cassette";
  return "other";
}

export function credits(artists: z.infer<typeof ArtistsSchema>): ArtistCredit[] {
  return artists.map((a) => ({
    name: stripDisambiguation(a.anv || a.name),
    providerId: String(a.id),
    joinPhrase: a.join ? (a.join === "," ? ", " : ` ${a.join} `) : "",
  }));
}

/** "Fleetwood Mac - Rumours" → ["Fleetwood Mac", "Rumours"] */
function splitTitle(title: string): [string, string] {
  const i = title.indexOf(" - ");
  return i > 0 ? [stripDisambiguation(title.slice(0, i)), title.slice(i + 3)] : ["", title];
}

export function mapDiscogsCandidate(r: DiscogsSearch["results"][number]): ReleaseCandidate {
  const [artist, title] = splitTitle(r.title);
  const formats = r.format ?? [];
  return {
    provider: "discogs",
    providerReleaseId: String(r.id),
    providerMasterId: r.master_id ? String(r.master_id) : undefined,
    title,
    artist,
    year: yearFrom(r.year ?? null),
    country: r.country ?? null,
    format: discogsFormat(formats[0]),
    formatSummary: [formats[0], formats.slice(1).join(", ")].filter(Boolean).join(" · "),
    label: r.label?.[0] ?? null,
    catalogNumber: r.catno && r.catno !== "none" ? r.catno : null,
    // Discogs lists every identifier here (IFPI codes, matrix text, …): keep real barcodes.
    barcodes: (r.barcode ?? []).filter(looksLikeBarcode),
    thumbUrl: r.cover_image || r.thumb || null,
  };
}

export function mapDiscogsRelease(r: DiscogsRelease, master?: MasterDetail): ReleaseDetail {
  const artists = credits(r.artists);
  const fmts = r.formats ?? [];
  const details = fmts.flatMap((f) => {
    const qty = Number(f.qty ?? 1);
    return [
      qty > 1 ? `${qty}×${f.name}` : f.name,
      ...(f.descriptions ?? []),
      ...(f.text ? [f.text] : []),
    ];
  });
  const first = fmts[0];
  const summary = first
    ? [
        Number(first.qty ?? 1) > 1 ? `${first.qty}×${first.name}` : first.name,
        (first.descriptions ?? []).join(", "),
        first.text ?? "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "Unknown";
  const tracklist: Track[] = (r.tracklist ?? [])
    .filter((t) => (t.type_ ?? "track") === "track")
    .map((t) => ({
      position: t.position ?? "",
      title: t.title,
      duration: t.duration || undefined,
    }));
  const cover = r.images?.find((i) => i.type === "primary") ?? r.images?.[0];
  const label = r.labels?.[0];
  return {
    provider: "discogs",
    providerReleaseId: String(r.id),
    title: r.title,
    artists,
    year: r.year || yearFrom(r.released),
    releaseDate: r.released || null,
    country: r.country ?? null,
    format: discogsFormat(first?.name),
    formatDetails: details,
    formatSummary: summary,
    label: label ? stripDisambiguation(label.name) : null,
    catalogNumber: label?.catno && label.catno !== "none" ? label.catno : null,
    barcodes: (r.identifiers ?? []).filter((i) => i.type === "Barcode").map((i) => i.value),
    tracklist,
    genres: master?.genres.length ? master.genres : (r.genres ?? []),
    styles: master?.styles.length ? master.styles : (r.styles ?? []),
    notes: r.notes?.trim() || null,
    coverUrl: cover?.uri ?? null,
    master: {
      providerId: r.master_id ? String(r.master_id) : null,
      title: master?.title ?? r.title,
      year: master?.year ?? r.year ?? null,
      artists: master?.artists ?? artists,
    },
    webUrl: r.uri || `https://www.discogs.com/release/${r.id}`,
  };
}

/** Authenticated, rate-limited GET against the Discogs API (shared by provider and importer). */
export function discogsClient(token: string) {
  const headers = { Authorization: `Discogs token=${token}` };
  // Pause the shared queue when Discogs says we're nearly out of requests.
  const onResponse = (res: Response) => {
    const remaining = Number(res.headers.get("x-discogs-ratelimit-remaining"));
    if (Number.isFinite(remaining) && remaining <= 2) {
      const q = queueFor("discogs");
      if (!q.isPaused) {
        q.pause();
        setTimeout(() => q.start(), 60_000).unref?.();
      }
    }
  };
  return <T>(path: string, schema: z.ZodType<T>) =>
    fetchJson(`${API}${path}`, { provider: "discogs", schema, headers, onResponse });
}

export function createDiscogsProvider(token: string): MetadataProvider & {
  getReleaseOnly(id: string): Promise<ReleaseDetail>;
} {
  const get = discogsClient(token);

  const search = async (params: Record<string, string>) => {
    const qs = new URLSearchParams({ type: "release", per_page: "25", ...params });
    const data = await get(`/database/search?${qs}`, SearchSchema);
    return data.results.filter((r) => r.type === "release").map(mapDiscogsCandidate);
  };

  const getMaster = async (id: string): Promise<MasterDetail> => {
    const m = await get(`/masters/${encodeURIComponent(id)}`, MasterSchema);
    return {
      provider: "discogs",
      providerId: String(m.id),
      title: m.title,
      year: m.year || null,
      artists: credits(m.artists),
      genres: m.genres ?? [],
      styles: m.styles ?? [],
    };
  };

  return {
    name: "discogs",
    searchByBarcode: (code) => search({ barcode: code.replace(/\D/g, "") }),
    searchByCatalogNumber: (catno) => search({ catno: catno.trim() }),
    searchByText: (query: string, opts?: SearchOptions) => {
      const formatParam = { vinyl: "Vinyl", cd: "CD", cassette: "Cassette", other: "" }[
        opts?.format ?? "other"
      ];
      return search({
        q: query.trim(),
        ...(opts?.format && formatParam ? { format: formatParam } : {}),
      });
    },
    /** Release without the extra master request (bulk imports). */
    async getReleaseOnly(id: string) {
      return mapDiscogsRelease(await get(`/releases/${encodeURIComponent(id)}`, ReleaseSchema));
    },
    async getRelease(id: string) {
      const r = await get(`/releases/${encodeURIComponent(id)}`, ReleaseSchema);
      // The master carries canonical title/year/genres; one extra (cached) call.
      const master = r.master_id
        ? await getMaster(String(r.master_id)).catch(() => undefined)
        : undefined;
      return mapDiscogsRelease(r, master);
    },
    getMaster,
  };
}

export { artistDisplay };
