/** Background import jobs. */
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, type DbHandle } from "@/db";
import { newId } from "@/db/ids";
import { exclusive } from "@/db/tx";

export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobProgress = { done: number; total: number | null; step: string };

export async function createJob(userId: string, kind: string, h: DbHandle = getDb()) {
  const id = newId();
  await exclusive(async () => {
    await h.db
      .insert(h.t.importJob)
      .values({ id, userId, kind, progress: { done: 0, total: null, step: "Queued" } });
  }, h);
  return id;
}

export async function updateJob(
  id: string,
  values: {
    status?: JobStatus;
    progress?: JobProgress;
    report?: Record<string, unknown> | null;
    error?: string | null;
  },
  h: DbHandle = getDb(),
) {
  await exclusive(async () => {
    await h.db
      .update(h.t.importJob)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(h.t.importJob.id, id));
  }, h);
}

export async function getJob(id: string, h: DbHandle = getDb()) {
  const [row] = await h.db.select().from(h.t.importJob).where(eq(h.t.importJob.id, id));
  return row ?? null;
}

export async function latestJob(userId: string, kind: string, h: DbHandle = getDb()) {
  const [row] = await h.db
    .select()
    .from(h.t.importJob)
    .where(and(eq(h.t.importJob.userId, userId), eq(h.t.importJob.kind, kind)))
    .orderBy(desc(h.t.importJob.createdAt))
    .limit(1);
  return row ?? null;
}

/** Jobs interrupted by a restart (to resume: imports are idempotent). */
export async function unfinishedJobs(h: DbHandle = getDb()) {
  return h.db
    .select()
    .from(h.t.importJob)
    .where(inArray(h.t.importJob.status, ["queued", "running"]));
}
