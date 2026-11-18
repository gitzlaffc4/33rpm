import path from "node:path";

/**
 * Which database backend a DATABASE_URL selects.
 * `file:` → SQLite (better-sqlite3); `postgres:` / `postgresql:` → PostgreSQL (pg).
 */
export type Dialect = "sqlite" | "pg";

export type DatabaseTarget =
  { dialect: "sqlite"; url: string; path: string } | { dialect: "pg"; url: string };

export class DatabaseUrlError extends Error {}

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

export function parseDatabaseUrl(url: string): DatabaseTarget {
  const trimmed = url.trim();
  if (/^file:/i.test(trimmed)) {
    const file = sqliteFileFromUrl(trimmed);
    if (!file) throw new DatabaseUrlError("DATABASE_URL file: URL has no path");
    return { dialect: "sqlite", url: trimmed, path: file };
  }
  if (/^postgres(ql)?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (!u.hostname) throw new Error("missing host");
    } catch {
      throw new DatabaseUrlError("DATABASE_URL is not a valid postgres:// URL");
    }
    return { dialect: "pg", url: trimmed };
  }
  throw new DatabaseUrlError(
    "DATABASE_URL must start with file: (SQLite) or postgres:// / postgresql:// (PostgreSQL)",
  );
}

/** A URL safe to log: credentials removed. */
export function redactDatabaseUrl(url: string): string {
  if (/^file:/i.test(url.trim())) return url; // no credentials in a file path
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    if (u.username) u.username = "****";
    return u.toString();
  } catch {
    return url.replace(/\/\/[^@/]*@/, "//****@");
  }
}
