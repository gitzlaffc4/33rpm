import path from "node:path";
import { z } from "zod";

/**
 * Runtime configuration, validated with Zod.
 *
 * Validation is lazy (`getEnv()`) rather than at import time because `next build`
 * imports server modules without the runtime environment present. The server
 * validates eagerly on startup from `src/instrumentation.ts`, so a bad config
 * still fails fast with a readable error.
 *
 * Every variable here is documented in `.env.example` and the README.
 */

const bool = (defaultValue: boolean) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return defaultValue;
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off"].includes(v)) return false;
      ctx.addIssue({ code: "custom", message: `expected true/false, got "${v}"` });
      return z.NEVER;
    });

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

// IPv4, IPv6 (loosely) and CIDR notation. Better Auth re-validates these strictly.
const ipOrCidr = /^(?:[0-9.]+|[0-9a-fA-F:.]+)(?:\/\d{1,3})?$/;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    APP_URL: z
      .url({ protocol: /^https?$/, message: "APP_URL must be an absolute http(s) URL" })
      .transform((v) => v.replace(/\/+$/, "")),
    AUTH_SECRET: z
      .string()
      .min(32, "AUTH_SECRET must be at least 32 characters (try `openssl rand -base64 32`)"),
    ENCRYPTION_KEY: optionalString.pipe(
      z.string().min(32, "ENCRYPTION_KEY must be at least 32 characters").optional(),
    ),

    DATA_DIR: optionalString,
    /** `file:/path/to.db` (SQLite). PostgreSQL URLs are accepted from Phase 0.5. */
    DATABASE_URL: optionalString,

    AUTH_LOCAL_LOGIN: bool(true),
    OIDC_ISSUER: optionalString.pipe(z.url().optional()),
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_PROVIDER_NAME: optionalString.transform((v) => v ?? "SSO"),
    OIDC_SCOPES: optionalString.transform((v) =>
      (v ?? "openid profile email").split(/[\s,]+/).filter(Boolean),
    ),
    OIDC_AUTO_SIGNUP: bool(false),
    OIDC_ALLOWED_EMAILS: list.transform((emails) => emails.map((e) => e.toLowerCase())),

    TRUSTED_PROXIES: list.refine((v) => v.every((p) => ipOrCidr.test(p)), {
      message: "TRUSTED_PROXIES must be a comma-separated list of IPs or CIDR ranges",
    }),
    IP_ADDRESS_HEADERS: list.transform((v) =>
      (v.length ? v : ["x-forwarded-for"]).map((h) => h.toLowerCase()),
    ),

    DISCOGS_TOKEN: optionalString,
  })
  .superRefine((env, ctx) => {
    const oidc = [env.OIDC_ISSUER, env.OIDC_CLIENT_ID, env.OIDC_CLIENT_SECRET];
    const set = oidc.filter(Boolean).length;
    if (set !== 0 && set !== 3) {
      ctx.addIssue({
        code: "custom",
        path: ["OIDC_ISSUER"],
        message: "OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must all be set (or none)",
      });
    }
    if (!env.AUTH_LOCAL_LOGIN && set !== 3) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_LOCAL_LOGIN"],
        message: "AUTH_LOCAL_LOGIN=false requires OIDC to be configured, or nobody could log in",
      });
    }
  })
  .transform((env, ctx) => {
    const dataDir = path.resolve(
      env.DATA_DIR ?? (env.NODE_ENV === "production" ? "/data" : "./data"),
    );
    const databaseUrl = env.DATABASE_URL ?? `file:${path.join(dataDir, "33rpm.db")}`;
    const sqlitePath = sqliteFileFromUrl(databaseUrl);
    if (!sqlitePath) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: /^postgres(ql)?:/i.test(databaseUrl)
          ? "PostgreSQL is not supported yet (planned for Phase 0.5); use a file: URL"
          : "DATABASE_URL must start with file: (e.g. file:/data/33rpm.db)",
      });
      return z.NEVER;
    }
    return {
      ...env,
      DATA_DIR: dataDir,
      DATABASE_URL: databaseUrl,
      DATABASE_DIALECT: "sqlite" as const,
      DATABASE_PATH: sqlitePath,
      IMAGES_DIR: path.join(dataDir, "images"),
      BACKUPS_DIR: path.join(dataDir, "backups"),
      OIDC_ENABLED: Boolean(env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET),
      SECURE_COOKIES: env.APP_URL.startsWith("https://"),
    };
  });

/**
 * Resolve a SQLite `file:` URL to an absolute path. Accepts `file:/abs`, `file:./rel`
 * and `file:///abs`. Returns null for any other scheme.
 */
export function sqliteFileFromUrl(url: string): string | null {
  const m = /^file:(.+)$/i.exec(url.trim());
  if (!m) return null;
  let p = m[1];
  if (p.startsWith("//")) p = p.replace(/^\/\/[^/]*/, ""); // file://host/path → /path
  return p ? path.resolve(decodeURIComponent(p)) : null;
}

export type Env = z.infer<typeof schema>;

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
  }
}

/** Parse an arbitrary env-like record. Exported for tests. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated runtime environment (parsed once, then cached). */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test helper: drop the cached env so the next `getEnv()` re-reads `process.env`. */
export function resetEnvCache() {
  cached = undefined;
}
