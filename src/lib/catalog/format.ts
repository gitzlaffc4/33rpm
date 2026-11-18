import type { Format } from "./types";

export const FORMAT_LABEL: Record<Format, string> = {
  vinyl: "Vinyl",
  cd: "CD",
  cassette: "Cassette",
  other: "Other",
};

export const FORMAT_ORDER: Format[] = ["vinyl", "cd", "cassette", "other"];

export function isFormat(v: unknown): v is Format {
  return typeof v === "string" && (FORMAT_ORDER as string[]).includes(v);
}

export const CONDITION_LABEL = {
  M: "Mint (M)",
  NM: "Near Mint (NM)",
  "VG+": "Very Good Plus (VG+)",
  VG: "Very Good (VG)",
  "G+": "Good Plus (G+)",
  G: "Good (G)",
  F: "Fair (F)",
  P: "Poor (P)",
} as const;

/** Number of minor-unit digits for a currency (JPY 0, USD 2, ...). */
export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** "24.99" + USD → 2499. Returns null for blank, NaN for garbage. */
export function parsePrice(input: string, currency: string): number | null {
  const v = input.trim().replace(/[^\d.,-]/g, "");
  if (!v) return null;
  // Accept "24,99" as a decimal comma when there's no dot.
  const normalized = v.includes(".") ? v.replace(/,/g, "") : v.replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return Number.NaN;
  return Math.round(n * 10 ** currencyDigits(currency));
}

export function formatPrice(
  minor: number | null,
  currency: string | null,
  locale?: string,
): string {
  if (minor === null || !currency) return "";
  const digits = currencyDigits(currency);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      minor / 10 ** digits,
    );
  } catch {
    return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** Minor units → plain input value ("24.99"). */
export function priceInputValue(minor: number | null, currency: string | null): string {
  if (minor === null) return "";
  const digits = currencyDigits(currency ?? "USD");
  return (minor / 10 ** digits).toFixed(digits);
}

export const PRIORITY_LABEL: Record<number, string> = { 1: "High", 2: "Medium", 3: "Low" };
