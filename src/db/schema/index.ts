/**
 * Two schema trees, kept in lock-step (see docs/addendum-01-postgres-support.md):
 * - `sqliteSchema` — better-sqlite3
 * - `pgSchema`     — node-postgres
 *
 * Repos are written once and type-check against the SQLite tree (`Schema`); at runtime
 * `getDb()` hands them the active dialect's tables. The CI matrix runs the
 * integration tests on both backends, and a unit test enforces table parity.
 */
import * as sqliteSchema from "./sqlite";
import * as pgSchema from "./pg";

export { sqliteSchema, pgSchema };
export type Schema = typeof sqliteSchema;
