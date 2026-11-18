/**
 * CSV import: target fields, header guessing (MusicBuddy/CLZ/Discogs-style exports) and
 * value normalization. Shared by the browser (preview) and the server (import).
 */
import type { Condition } from "@/db/repos/catalog";
import { searchKey } from "./normalize";
import type { Format } from "./types";

export const IMPORT_FIELDS = [
  ["artist", "Artist", ["artist", "artists", "artist name", "band"]],
  ["title", "Title", ["title", "album", "album title", "release title", "name"]],
  ["format", "Format", ["format", "media", "media type", "type"]],
  ["formatDetails", "Format details", ["format details", "format description", "descriptions"]],
  ["label", "Label", ["label", "labels", "record label", "publisher"]],
  [
    "catalogNumber",
    "Catalog number",
    ["catalog number", "catalog", "catno", "cat no", "cat", "cat number", "catalog no"],
  ],
  ["barcode", "Barcode", ["barcode", "upc", "ean", "upc ean", "isbn"]],
  ["country", "Country", ["country", "released in"]],
  ["year", "Year", ["year", "release year", "released", "release date", "original release year"]],
  [
    "mediaCondition",
    "Media condition",
    [
      "media condition",
      "condition",
      "disc condition",
      "record condition",
      "collection media condition",
    ],
  ],
  [
    "sleeveCondition",
    "Sleeve condition",
    ["sleeve condition", "cover condition", "case condition", "collection sleeve condition"],
  ],
  ["price", "Price", ["price", "purchase price", "paid", "cost", "price paid"]],
  ["currency", "Currency", ["currency"]],
  [
    "acquiredOn",
    "Date acquired",
    ["purchase date", "date acquired", "acquired", "date added", "added", "bought"],
  ],
  [
    "source",
    "Bought from",
    ["store", "purchase store", "source", "seller", "where bought", "purchased from"],
  ],
  [
    "location",
    "Location",
    ["location", "storage", "storage device", "shelf", "crate", "collection folder", "folder"],
  ],
  ["tags", "Tags", ["tags", "tag", "genre tags"]],
  ["notes", "Notes", ["notes", "note", "comments", "collection notes"]],
  ["rating", "Rating", ["rating", "my rating", "stars"]],
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number][0];
/** CSV column index for each field (or -1). */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export function guessMapping(header: string[]): ColumnMapping {
  const keys = header.map((h) => searchKey(h));
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const [field, , synonyms] of IMPORT_FIELDS) {
    const idx = synonyms
      .map((s) => keys.findIndex((k, i) => k === s && !used.has(i)))
      .find((i) => i >= 0);
    if (idx !== undefined && idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

export function normalizeFormat(v: string): Format {
  const f = v.toLowerCase();
  if (/vinyl|\blp\b|\bep\b|7"|10"|12"|record|45|33/.test(f)) return "vinyl";
  if (/\bcd\b|compact disc|sacd|hdcd/.test(f)) return "cd";
  if (/cassette|tape|\bmc\b/.test(f)) return "cassette";
  return "other";
}

const CONDITION_WORDS: [RegExp, Condition][] = [
  [/^(m|mint)\b/, "M"],
  [/^(nm|near mint|m-|mint-|mint minus)\b/, "NM"],
  [/^(vg\+|very good plus|vg plus|excellent|ex)\b/, "VG+"],
  [/^(vg|very good)\b/, "VG"],
  [/^(g\+|good plus)\b/, "G+"],
  [/^(g|good)\b/, "G"],
  [/^(f|fair)\b/, "F"],
  [/^(p|poor)\b/, "P"],
];

/** "Near Mint (NM or M-)", "VG+", "Very Good Plus" → Goldmine code; unknown → null. */
export function normalizeCondition(v: string): Condition | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  const paren = /\(([^)]+)\)/.exec(s)?.[1];
  for (const candidate of [s, paren ?? ""]) {
    for (const [re, code] of CONDITION_WORDS) if (candidate && re.test(candidate)) return code;
  }
  return null;
}

/** Many date spellings → YYYY-MM-DD, or null. */
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s); // DD/MM/YYYY or MM/DD/YYYY: assume day-first only if > 12
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [day, month] = a > 12 ? [a, b] : [b, a];
    return `${m[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

export function normalizeYear(v: string): number | null {
  const m = /(1[89]\d\d|20\d\d|2100)/.exec(v);
  return m ? Number(m[1]) : null;
}

export function normalizeRating(v: string): number | null {
  const n = Number.parseFloat(v.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  // 10-point scales (CLZ) → 5 stars.
  return Math.min(5, Math.max(1, Math.round(n > 5 ? n / 2 : n)));
}
