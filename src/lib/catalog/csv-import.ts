import "server-only";

import {
  createCopy,
  createManualRelease,
  ensureLocation,
  findMatchingRelease,
  userOwnsRelease,
} from "@/db/repos/catalog";
import { CURRENCY_CODES } from "@/lib/currencies";
import {
  normalizeCondition,
  normalizeDate,
  normalizeFormat,
  normalizeRating,
  normalizeYear,
  type ColumnMapping,
  type ImportField,
} from "./csv-mapping";
import { parsePrice } from "./format";
import { looksLikeBarcode } from "./normalize";

export type CsvImportReport = {
  added: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/**
 * Import CSV rows (header excluded) as manual releases + copies. Rows whose release the
 * user already owns are skipped when `skipOwned` (so re-importing the same file is safe).
 */
export async function importCsvRows(
  userId: string,
  rows: string[][],
  mapping: ColumnMapping,
  opts: { defaultCurrency: string; skipOwned: boolean; firstRowNumber?: number },
): Promise<CsvImportReport> {
  const report: CsvImportReport = { added: 0, skipped: 0, errors: [] };
  const locations = new Map<string, string>();
  for (const [i, row] of rows.entries()) {
    const rowNumber = (opts.firstRowNumber ?? 2) + i;
    const get = (f: ImportField) => {
      const idx = mapping[f];
      return idx === undefined || idx < 0 ? "" : (row[idx] ?? "").trim();
    };
    try {
      const artist = get("artist");
      const title = get("title");
      if (!artist || !title) throw new Error("Artist and title are required");
      const format = normalizeFormat(get("format"));
      const barcodeRaw = get("barcode");
      const barcode = barcodeRaw && looksLikeBarcode(barcodeRaw) ? barcodeRaw : null;
      const catalogNumber = get("catalogNumber") || null;

      let releaseId = await findMatchingRelease({ artist, title, format, catalogNumber, barcode });
      if (releaseId && opts.skipOwned && (await userOwnsRelease(userId, releaseId))) {
        report.skipped++;
        continue;
      }
      if (!releaseId) {
        ({ releaseId } = await createManualRelease(
          userId,
          {
            artist,
            title,
            year: normalizeYear(get("year")),
            format,
            formatDetails: get("formatDetails")
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean),
            label: get("label") || null,
            catalogNumber,
            country: get("country") || null,
            barcode,
            tracklist: [],
            notes: null,
          },
          null,
        ));
      }
      const currencyCell = get("currency").toUpperCase();
      const currency = (CURRENCY_CODES as readonly string[]).includes(currencyCell)
        ? currencyCell
        : opts.defaultCurrency;
      const priceMinor = get("price") ? parsePrice(get("price"), currency) : null;
      const locationName = get("location");
      let locationId: string | null = null;
      if (locationName) {
        locationId = locations.get(locationName) ?? (await ensureLocation(userId, locationName));
        locations.set(locationName, locationId);
      }
      await createCopy(userId, releaseId, {
        mediaCondition: normalizeCondition(get("mediaCondition")),
        sleeveCondition: normalizeCondition(get("sleeveCondition")),
        priceMinor: priceMinor === null || Number.isNaN(priceMinor) ? null : priceMinor,
        currency: priceMinor === null || Number.isNaN(priceMinor) ? null : currency,
        acquiredOn: normalizeDate(get("acquiredOn")),
        source: get("source").slice(0, 120) || null,
        locationId,
        notes: get("notes").slice(0, 4000) || null,
        rating: normalizeRating(get("rating")),
        tags: get("tags")
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      report.added++;
    } catch (e) {
      report.errors.push({ row: rowNumber, message: (e as Error).message });
    }
  }
  return report;
}
