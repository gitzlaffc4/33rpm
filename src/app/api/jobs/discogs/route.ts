import { latestJob } from "@/db/repos/jobs";
import { sessionUser } from "@/lib/api-auth";
import { DISCOGS_JOB } from "@/lib/integrations/discogs-import";

/** Latest Discogs import job for the signed-in user (progress polling). */
export async function GET(request: Request) {
  const user = await sessionUser(request);
  if (!user) return new Response("Unauthorized", { status: 401 });
  const job = await latestJob(user.id, DISCOGS_JOB);
  return Response.json(
    job && {
      id: job.id,
      status: job.status,
      progress: job.progress,
      report: job.report,
      error: job.error,
      updatedAt: job.updatedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
