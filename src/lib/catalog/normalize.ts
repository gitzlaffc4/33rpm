/**
 * Normalized companion values (portability rules 6 and 7): matching is done on these
 * columns, never with ILIKE / COLLATE NOCASE.
 */

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function searchKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Digits only. */
export function normalizeBarcode(value: string): string {
  return value.replace(/\D/g, "");
}

/** Alphanumerics only, uppercased ("BSK-3010" → "BSK3010"). */
export function normalizeCatalogNumber(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toUpperCase();
}

/** UPC-A/EAN-13/EAN-8 lengths after normalization. */
export function looksLikeBarcode(value: string): boolean {
  const digits = normalizeBarcode(value);
  return digits.length >= 8 && digits.length <= 14 && /^[\d\s-]+$/.test(value.trim());
}

/** "Artist (2)" → "Artist" (Discogs disambiguation suffix). */
export function stripDisambiguation(name: string): string {
  return name.replace(/\s+\(\d+\)$/, "").trim();
}

/** Parse "1977-02-04" / "1977" / "" into a year. */
export function yearFrom(date: string | number | null | undefined): number | null {
  if (typeof date === "number") return date > 0 ? date : null;
  const m = /^(\d{4})/.exec(date ?? "");
  return m ? Number(m[1]) : null;
}

/** "The Beatles" → "Beatles, The" for sorting when no sort name is known. */
export function defaultSortName(name: string): string {
  const m = /^(the|a|an)\s+(.+)$/i.exec(name.trim());
  return m ? `${m[2]}, ${m[1]}` : name.trim();
}
