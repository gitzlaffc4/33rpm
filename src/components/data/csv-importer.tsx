"use client";

import { FileUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CsvImportReport } from "@/lib/catalog/csv-import";
import { guessMapping, IMPORT_FIELDS, type ColumnMapping, type ImportField } from "@/lib/catalog/csv-mapping";
import { importCsv } from "@/lib/catalog/import-actions";
import { parseCsv } from "@/lib/csv";

export function CsvImporter() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [skipOwned, setSkipOwned] = useState(true);
  const [result, setResult] = useState<CsvImportReport | { error: string } | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(() => (text ? parseCsv(text) : []), [text]);
  const header = rows[0] ?? [];
  const preview = rows.slice(1, 4);

  const onFile = async (file: File | undefined) => {
    setResult(null);
    if (!file) return;
    const content = await file.text();
    setFileName(file.name);
    setText(content);
    setMapping(guessMapping(parseCsv(content)[0] ?? []));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV file</Label>
        <Input id="csv-file" type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values" onChange={(e) => void onFile(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">
          Exports from MusicBuddy, CLZ, Discogs or a spreadsheet. The first row must be the column headers.
        </p>
      </div>

      {header.length > 0 && (
        <>
          <p className="text-sm">
            <strong>{fileName}</strong>: {rows.length - 1} rows, {header.length} columns. Match the columns:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {IMPORT_FIELDS.map(([field, label]) => (
              <div key={field} className="grid grid-cols-[8rem_1fr] items-center gap-2">
                <Label htmlFor={`map-${field}`} className="text-sm">
                  {label}
                  {(field === "artist" || field === "title") && <span className="text-destructive"> *</span>}
                </Label>
                <NativeSelect
                  id={`map-${field}`}
                  value={mapping[field] ?? -1}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field as ImportField]: Number(e.target.value) }))
                  }
                >
                  <option value={-1}>—</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Preview</caption>
                <thead className="bg-secondary/50">
                  <tr>
                    {["artist", "title", "format", "catalogNumber", "barcode", "mediaCondition", "price", "location"].map((f) => (
                      <th key={f} scope="col" className="px-2 py-1 font-medium">
                        {IMPORT_FIELDS.find(([k]) => k === f)?.[1]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t">
                      {(["artist", "title", "format", "catalogNumber", "barcode", "mediaCondition", "price", "location"] as const).map((f) => (
                        <td key={f} className="max-w-40 truncate px-2 py-1">
                          {mapping[f] !== undefined && mapping[f]! >= 0 ? r[mapping[f]!] : ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={skipOwned} onChange={(e) => setSkipOwned(e.target.checked)} className="size-4 accent-primary" />
            Skip rows for releases I already own (safe to re-import the same file)
          </label>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => setResult(await importCsv(text, mapping, { skipOwned, hasHeader: true })))
            }
          >
            <FileUp aria-hidden /> {pending ? "Importing…" : `Import ${rows.length - 1} rows`}
          </Button>
        </>
      )}

      {result && (
        <div role="status" aria-live="polite" className="space-y-1 rounded-lg border p-3 text-sm">
          {"error" in result ? (
            <p className="text-destructive">{result.error}</p>
          ) : (
            <>
              <p>
                Added <strong>{result.added}</strong>, skipped {result.skipped}
                {result.errors.length > 0 && <>, {result.errors.length} failed</>}.{" "}
                <Link href="/library?view=recent" className="text-primary underline-offset-2 hover:underline">
                  See them
                </Link>
              </p>
              {result.errors.slice(0, 20).map((e) => (
                <p key={e.row} className="text-xs text-destructive">
                  Row {e.row}: {e.message}
                </p>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
