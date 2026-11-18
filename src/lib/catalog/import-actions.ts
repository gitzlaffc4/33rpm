"use server";

import { refresh } from "next/cache";

import { getUserSettings } from "@/db/repos/settings";
import { importCsvRows, type CsvImportReport } from "@/lib/catalog/csv-import";
import { IMPORT_FIELDS, type ColumnMapping } from "@/lib/catalog/csv-mapping";
import { parseCsv } from "@/lib/csv";
import { requireUser } from "@/lib/session";

const MAX_ROWS = 20_000;

export async function importCsv(
  text: string,
  mapping: ColumnMapping,
  opts: { skipOwned: boolean; hasHeader: boolean },
): Promise<CsvImportReport | { error: string }> {
  const user = await requireUser();
  if (typeof text !== "string" || text.length > 25 * 1024 * 1024)
    return { error: "File too large." };
  const clean: ColumnMapping = {};
  for (const [field] of IMPORT_FIELDS) {
    const v = mapping?.[field];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 500) clean[field] = v;
  }
  if (clean.artist === undefined || clean.title === undefined) {
    return { error: "Map at least the Artist and Title columns." };
  }
  const rows = parseCsv(text);
  const data = opts.hasHeader ? rows.slice(1) : rows;
  if (data.length > MAX_ROWS) return { error: `Too many rows (max ${MAX_ROWS}). Split the file.` };
  const settings = await getUserSettings(user.id);
  const report = await importCsvRows(user.id, data, clean, {
    defaultCurrency: settings.defaultCurrency,
    skipOwned: opts.skipOwned,
    firstRowNumber: opts.hasHeader ? 2 : 1,
  });
  refresh();
  return report;
}

export async function startDiscogsImportAction(
  _prev: { ok?: string; error?: string },
  formData: FormData,
): Promise<{ ok?: string; error?: string }> {
  const user = await requireUser();
  const { resolveDiscogsToken } = await import("@/lib/discogs-token");
  if (!(await resolveDiscogsToken(user.id))) {
    return { error: "Add your Discogs personal access token in Settings first." };
  }
  const { startDiscogsImport } = await import("@/lib/integrations/discogs-import");
  const foldersAs = formData.get("foldersAs");
  await startDiscogsImport(user.id, {
    collection: formData.get("collection") === "on",
    wantlist: formData.get("wantlist") === "on",
    details: formData.get("details") === "on",
    foldersAs: foldersAs === "tags" || foldersAs === "ignore" ? foldersAs : "locations",
  });
  refresh();
  return { ok: "Import started. You can leave this page; it keeps running." };
}
