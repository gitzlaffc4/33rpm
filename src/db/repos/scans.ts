/** Crate-mode scan queue. */
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { newId } from "@/db/ids";
import { exclusive } from "@/db/tx";
import { normalizeBarcode } from "@/lib/catalog/normalize";
import type { ReleaseCandidate } from "@/lib/providers/types";

export type ScanStatus =
  "pending" | "matched" | "ambiguous" | "not_found" | "error" | "added" | "dismissed";

export type ScanItem = {
  id: string;
  userId: string;
  barcode: string;
  status: ScanStatus;
  candidates: ReleaseCandidate[];
  releaseId: string | null;
  copyId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const CLOSED: ScanStatus[] = ["added", "dismissed"];

export async function enqueueScan(userId: string, barcode: string, h: DbHandle = getDb()) {
  const code = normalizeBarcode(barcode);
  if (code.length < 6 || code.length > 14) throw new Error("Not a barcode");
  const id = newId();
  await exclusive(async () => {
    await h.db.insert(h.t.scanItem).values({ id, userId, barcode: code, candidates: [] });
  }, h);
  return id;
}

export async function getScan(id: string, h: DbHandle = getDb()): Promise<ScanItem | null> {
  const [row] = await h.db.select().from(h.t.scanItem).where(eq(h.t.scanItem.id, id));
  return (row as ScanItem | undefined) ?? null;
}

/** Scans still waiting for a lookup or a decision, oldest first. */
export async function listOpenScans(userId: string, h: DbHandle = getDb()): Promise<ScanItem[]> {
  const rows = await h.db
    .select()
    .from(h.t.scanItem)
    .where(and(eq(h.t.scanItem.userId, userId), notInArray(h.t.scanItem.status, CLOSED)))
    .orderBy(asc(h.t.scanItem.createdAt), asc(h.t.scanItem.id));
  return rows as ScanItem[];
}

/** Every user's pending lookups (resumed after a restart). */
export async function listPendingScans(h: DbHandle = getDb()) {
  return h.db
    .select({ id: h.t.scanItem.id })
    .from(h.t.scanItem)
    .where(eq(h.t.scanItem.status, "pending"));
}

export async function setScanResult(
  id: string,
  result: {
    status: ScanStatus;
    candidates?: ReleaseCandidate[];
    releaseId?: string | null;
    copyId?: string | null;
    error?: string | null;
  },
  h: DbHandle = getDb(),
) {
  await exclusive(async () => {
    await h.db
      .update(h.t.scanItem)
      .set({ ...result, updatedAt: new Date() })
      .where(eq(h.t.scanItem.id, id));
  }, h);
}

export async function dismissScans(userId: string, ids: string[], h: DbHandle = getDb()) {
  if (!ids.length) return;
  await exclusive(async () => {
    await h.db
      .update(h.t.scanItem)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(and(eq(h.t.scanItem.userId, userId), inArray(h.t.scanItem.id, ids)));
  }, h);
}
