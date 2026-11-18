/**
 * HTTP for metadata providers: descriptive User-Agent, per-provider rate-limited
 * queues, retries on 429/503 (MusicBrainz signals rate limiting with 503), timeouts.
 */
import PQueue from "p-queue";
import type { z } from "zod";

import { APP_VERSION, REPO_URL } from "@/lib/version";

export const USER_AGENT = `33rpm/${APP_VERSION} +${REPO_URL}`;

export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
    this.name = "ProviderError";
  }
}

type QueueName = "musicbrainz" | "discogs" | "coverart";

// One queue per provider per process (cached on globalThis for dev HMR).
const g = globalThis as unknown as { __33rpmQueues?: Record<QueueName, PQueue> };
export function queueFor(name: QueueName): PQueue {
  g.__33rpmQueues ??= {
    // MusicBrainz: at most 1 request per second per client.
    musicbrainz: new PQueue({ concurrency: 1, intervalCap: 1, interval: 1100 }),
    // Discogs: 60/min authenticated; we also pause on X-Discogs-Ratelimit-Remaining.
    discogs: new PQueue({ concurrency: 2, intervalCap: 55, interval: 60_000 }),
    // Cover Art Archive / image hosts: modest parallelism.
    coverart: new PQueue({ concurrency: 2, intervalCap: 4, interval: 1000 }),
  };
  return g.__33rpmQueues[name];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FetchJsonOptions<T> = {
  provider: QueueName;
  schema: z.ZodType<T>;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Called with each response (e.g. to read rate-limit headers). */
  onResponse?: (res: Response) => void;
};

/** GET JSON through the provider's queue, validated with `schema`. */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions<T>): Promise<T> {
  const queue = queueFor(opts.provider);
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const res = await queue.add(() =>
      fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        redirect: "follow",
      }),
    );
    opts.onResponse?.(res);
    if ((res.status === 429 || res.status === 503 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    if (res.status === 404) throw new ProviderError(opts.provider, "not found", 404);
    if (!res.ok) throw new ProviderError(opts.provider, `HTTP ${res.status}`, res.status);
    const parsed = opts.schema.safeParse(await res.json());
    if (!parsed.success) {
      throw new ProviderError(opts.provider, `unexpected response: ${parsed.error.issues[0]?.message}`);
    }
    return parsed.data;
  }
}

/** GET binary data (images) through a queue, with a size cap. */
export async function fetchBytes(
  url: string,
  opts: { provider: QueueName; maxBytes?: number; timeoutMs?: number; headers?: Record<string, string> },
): Promise<{ bytes: Buffer; contentType: string; finalUrl: string }> {
  const res = await queueFor(opts.provider).add(() =>
    fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...opts.headers },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      redirect: "follow",
    }),
  );
  if (!res.ok) throw new ProviderError(opts.provider, `image HTTP ${res.status}`, res.status);
  const max = opts.maxBytes ?? 15 * 1024 * 1024;
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > max) throw new ProviderError(opts.provider, "image too large");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > max) throw new ProviderError(opts.provider, "image too large");
  return { bytes, contentType: res.headers.get("content-type") ?? "", finalUrl: res.url };
}
