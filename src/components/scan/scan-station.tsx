"use client";

/* eslint-disable @next/next/no-img-element -- images come from our own /api/images routes */
import { CircleAlert, CircleCheck, CircleHelp, Loader2, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dismissScan, queueScan, retryScan } from "@/lib/catalog/scan-actions";
import type { ScanView } from "@/lib/catalog/scan-view";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "./barcode-scanner";

const STATUS: Record<ScanView["status"], { label: string; className: string }> = {
  pending: { label: "Looking up…", className: "text-muted-foreground" },
  matched: { label: "Found", className: "text-success" },
  ambiguous: { label: "Choose a pressing", className: "text-primary" },
  not_found: { label: "Not found", className: "text-destructive" },
  error: { label: "Lookup failed", className: "text-destructive" },
  added: { label: "Added", className: "text-success" },
  dismissed: { label: "Dismissed", className: "text-muted-foreground" },
};

function StatusIcon({ status }: { status: ScanView["status"] }) {
  const cls = cn("size-5 shrink-0", STATUS[status].className);
  if (status === "pending") return <Loader2 className={cn(cls, "animate-spin")} aria-hidden />;
  if (status === "matched") return <CircleCheck className={cls} aria-hidden />;
  if (status === "ambiguous") return <CircleHelp className={cls} aria-hidden />;
  return <CircleAlert className={cls} aria-hidden />;
}

function thumb(item: ScanView) {
  if (item.match?.imageId) return `/api/images/${item.match.imageId}?size=600`;
  if (item.match?.thumbUrl)
    return `/api/images/remote?url=${encodeURIComponent(item.match.thumbUrl)}`;
  return null;
}

export function ScanStation({ crate }: { crate: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<ScanView[]>([]);
  const [manual, setManual] = useState("");
  const [message, setMessage] = useState("");
  const [, startTransition] = useTransition();
  const polling = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/scans", { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: ScanView[] };
    setItems(data.items);
    return data.items;
  }, []);

  // Poll while lookups are running.
  const poll = useCallback(() => {
    if (polling.current) clearTimeout(polling.current);
    const tick = async () => {
      const list = await load();
      if (list.some((i) => i.status === "pending")) polling.current = setTimeout(tick, 1500);
      else polling.current = null;
    };
    void tick();
  }, [load]);

  useEffect(() => {
    if (crate) poll();
    return () => {
      if (polling.current) clearTimeout(polling.current);
    };
  }, [crate, poll]);

  const submit = useCallback(
    async (code: string) => {
      const clean = code.replace(/\D/g, "");
      if (!clean) return;
      if (!crate) {
        router.push(`/add?q=${clean}&mode=barcode`);
        return;
      }
      const res = await queueScan(clean);
      if (res.error) {
        setMessage(res.error);
        return;
      }
      setMessage(`Queued ${clean}`);
      poll();
    },
    [crate, poll, router],
  );

  const counts = {
    ready: items.filter((i) => i.status === "matched").length,
    review: items.filter((i) => i.status === "ambiguous").length,
    pending: items.filter((i) => i.status === "pending").length,
    problems: items.filter((i) => i.status === "not_found" || i.status === "error").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border p-1" role="group" aria-label="Scan mode">
        {[
          [false, "Single", "/scan"],
          [true, "Crate mode", "/scan?mode=crate"],
        ].map(([isCrate, label, href]) => (
          <Link
            key={String(label)}
            href={href as string}
            replace
            aria-current={crate === isCrate ? "page" : undefined}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium text-muted-foreground",
              crate === isCrate && "bg-secondary text-foreground",
            )}
          >
            {label as string}
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {crate
          ? "Scan one item after another; lookups run in the background. Review and add them all at the end."
          : "Scan a barcode to search for it."}
      </p>

      <BarcodeScanner continuous={crate} onDetect={(code) => void submit(code)} />

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(manual);
          setManual("");
        }}
      >
        <div className="flex-1 space-y-1">
          <Label htmlFor="manual-barcode">Type a barcode</Label>
          <Input
            id="manual-barcode"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="go"
            placeholder="075992731324"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          {crate ? "Queue" : "Search"}
        </Button>
      </form>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>

      {crate && (
        <section aria-labelledby="queue-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="queue-heading" className="text-lg font-medium">
              Scanned ({items.length})
            </h2>
            {items.length > 0 && (
              <Button asChild disabled={counts.pending > 0}>
                <Link href="/scan/review">Review & add</Link>
              </Button>
            )}
          </div>
          {items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {counts.ready} ready · {counts.review} to choose · {counts.problems} not found
              {counts.pending > 0 && ` · ${counts.pending} looking up`}
            </p>
          )}
          <ul className="divide-y rounded-lg border">
            {items.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">Nothing scanned yet.</li>
            )}
            {[...items].reverse().map((item) => {
              const src = thumb(item);
              return (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded bg-secondary">
                    {src && <img src={src} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.match ? `${item.match.artist} — ${item.match.title}` : item.barcode}
                    </p>
                    <p
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        STATUS[item.status].className,
                      )}
                    >
                      <StatusIcon status={item.status} />
                      {STATUS[item.status].label}
                      {item.status === "ambiguous" && ` (${item.candidates})`}
                      {item.match && (
                        <span className="text-muted-foreground"> · {item.barcode}</span>
                      )}
                    </p>
                  </div>
                  {item.status === "error" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Retry ${item.barcode}`}
                      onClick={() =>
                        startTransition(async () => {
                          await retryScan(item.id);
                          poll();
                        })
                      }
                    >
                      <RotateCw aria-hidden />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${item.barcode}`}
                    onClick={() =>
                      startTransition(async () => {
                        await dismissScan(item.id);
                        await load();
                      })
                    }
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
