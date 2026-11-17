# Addendum 01 — Dual database support (SQLite + PostgreSQL)

**Status:** Approved · **Applies to:** CLAUDE.md, ROADMAP.md · **Do before:** Phase 1 catalog schema

## Decision

33rpm supports two database backends, selected at startup by `DATABASE_URL`:

| Backend | When | Driver |
|---|---|---|
| **SQLite** (default) | Single-container installs, Raspberry Pi, most self-hosters | `better-sqlite3` |
| **PostgreSQL** | Users who already run Postgres, want external backups/HA, or host for many users | `pg` (node-postgres, pure JS — no native build) |

SQLite stays the default and the primary development target. Postgres is a fully supported
peer, verified in CI — not a best-effort extra.

---

## Configuration

`DATABASE_URL` replaces `DATABASE_PATH`.

```
# SQLite (default if unset)
DATABASE_URL=file:/data/33rpm.db

# PostgreSQL
DATABASE_URL=postgres://33rpm:secret@db:5432/33rpm
DATABASE_SSL=false            # optional: true | false | require
DATABASE_POOL_MAX=10          # optional, Postgres only

# Optional: import an existing library from another database on first boot (Phase 4)
MIGRATE_FROM_URL=file:/data/33rpm.db
```

- Dialect is inferred from the URL scheme (`file:` → sqlite, `postgres:`/`postgresql:` → pg).
  Anything else fails startup with a clear error.
- If `DATABASE_URL` is unset, default to `file:${DATA_DIR}/33rpm.db`.
- `/data` is still required for both backends (images, backups), so the volume stays.
- Log the active dialect (never the credentials) at startup and expose it on `/api/health`.

---

## Code structure

```
src/db/
├── index.ts              # reads DATABASE_URL, returns { db, dialect, schema }
├── dialect.ts            # parse URL → 'sqlite' | 'pg'
├── migrate.ts            # runs the migration set for the active dialect
├── schema/
│   ├── sqlite/*.ts       # sqliteTable definitions
│   ├── pg/*.ts           # pgTable definitions (same tables, same columns, same names)
│   └── index.ts          # exports the active schema
├── types.ts              # dialect-neutral domain types used by the app
├── repos/*.ts            # ALL queries live here; UI/actions never touch Drizzle directly
└── search/               # SearchIndex interface + sqlite (FTS5) and pg (tsvector/pg_trgm) impls
drizzle/
├── sqlite/               # migrations generated for SQLite (committed)
└── pg/                   # migrations generated for Postgres (committed)
drizzle.sqlite.config.ts
drizzle.pg.config.ts
```

- Drizzle cannot share one table definition across dialects, so there are **two schema trees
  kept in lock-step**. A unit test enforces parity: same tables, same columns, same nullability,
  same indexes/uniques. Any schema change must touch both trees and both migration folders in
  the same commit.
- Repos are written once. They may type-check against one dialect's schema; the CI matrix
  (below) is the safety net that proves they run on both.
- `npm run db:generate` generates migrations for **both** dialects.

---

## Portability rules (apply to every table and query)

1. **IDs:** app-generated text IDs (UUIDv7 or cuid2). No autoincrement integers. Makes
   cross-database migration and imports trivial.
2. **Timestamps:** JS `Date` in the app. SQLite → `integer({ mode: 'timestamp_ms' })`;
   Postgres → `timestamp({ withTimezone: true, mode: 'date' })`. Always UTC.
3. **Booleans:** `integer({ mode: 'boolean' })` in SQLite, `boolean` in Postgres.
4. **Money:** integer minor units (cents) + ISO currency code. Never float/real/numeric.
5. **JSON:** `text({ mode: 'json' })` in SQLite, `jsonb` in Postgres. Never query inside JSON —
   if it needs filtering, it gets a real column.
6. **Case-insensitive matching:** store normalized companion columns (e.g. `titleSearch`,
   `artistSort`, lowercase/diacritics-stripped) and query those. No `ILIKE`, no `COLLATE NOCASE`.
7. **Barcodes/catalog numbers:** store raw and normalized (digits/alphanumerics only) columns.
8. **Upserts:** use Drizzle's `onConflictDoUpdate` / `onConflictDoNothing` only.
9. **No raw SQL** outside `src/db/search/` and migrations. If raw SQL is unavoidable, it lives
   behind a function with both dialect implementations and tests for each.
10. **Transactions:** go through a `withTransaction()` helper. Keep transaction bodies to DB work
    only — never await network calls (Discogs/MusicBrainz) inside a transaction. (better-sqlite3
    transactions are synchronous under the hood; Postgres holds a pooled connection.)
11. **Full-text search:** only via the `SearchIndex` interface. SQLite uses FTS5; Postgres uses
    `tsvector` + `pg_trgm`. A LIKE-on-normalized-columns fallback is acceptable until Phase 5.

---

## Auth

Better Auth's Drizzle adapter is configured with `provider: 'sqlite'` or `provider: 'pg'` to
match the active dialect. Auth tables exist in both schema trees and follow the parity test.

---

## Startup, migrations & backups

| Concern | SQLite | PostgreSQL |
|---|---|---|
| Startup migrations | Run automatically | Run automatically, guarded by a Postgres advisory lock so multiple replicas can't race |
| Pre-migration snapshot | Copy DB file to `/data/backups/` (as already planned) | Skip; log a warning recommending `pg_dump` before upgrading. Do **not** bundle Postgres client binaries in the image. |
| Nightly backup (Phase 4) | File snapshot | Not handled by the app — document `pg_dump` / existing DB backup tooling |
| Portable backup (Phase 4) | JSON export | JSON export (identical format) |
| SQLite pragmas | WAL, `foreign_keys=ON`, `busy_timeout` | n/a |

### Moving between databases (Phase 4)

Users can switch backends in either direction (SQLite ⇄ Postgres) without losing data.
Two entry points share **one copy engine** (`src/db/copy/`), also used by JSON export/import.

#### 1. In-app import on startup (primary path)

The intended user flow is: stop the app → change `DATABASE_URL` → start the app.

On startup, after migrations run on the active database:

1. If the active database has **no users and no catalog rows**, check for a source:
   - `MIGRATE_FROM_URL` if set (any dialect), otherwise
   - when running on Postgres, a SQLite file at the default path (`$DATA_DIR/33rpm.db`).
2. If a source with data is found, the first-run flow shows an **"Import existing library"**
   step instead of the normal admin setup. It shows source dialect and row counts
   (e.g. "Found SQLite library: 1,243 copies, 87 wishlist items, 1 user").
3. The step is protected by the same one-time setup code as `/setup` (printed to logs).
4. On confirm:
   - Apply the active dialect's migrations (already done at boot).
   - Copy every table in dependency order, **preserving IDs**, inside a single transaction
     on the target.
   - Verify per-table row counts match; on mismatch, roll back and show the error.
   - Write a log to `/data/backups/migration-<timestamp>.log` (tables, counts, duration).
   - If the source was the default SQLite file, rename it to
     `33rpm.db.migrated-<timestamp>` so the import can't be offered again. Never delete it.
5. The user then logs in with their existing account(s). Images in `/data/images` are
   untouched and keep working because paths are relative to `DATA_DIR`.
6. Choosing "Start fresh instead" skips the import and runs the normal setup; the source
   is left untouched.

Safety rules:
- **Target must be empty.** Refuse if it has any users or catalog rows.
- **Source is read-only.** Open it read-only; never write to it (except the final rename).
- **No writes during import.** The app serves only the import screen until it finishes.
- **Rollback = change `DATABASE_URL` back.** The source is preserved for exactly this.
- **Postgres → SQLite** works the same way via `MIGRATE_FROM_URL=postgres://…`.

#### 2. CLI: `db:copy` (scripted path)

```
docker exec 33rpm node dist/cli.js db:copy --from <url> --to <url> [--dry-run]
```

Same engine and safety rules as the in-app import. `--dry-run` reports row counts and
schema-version compatibility without writing. Exits non-zero on any mismatch.

#### Schema version compatibility
Source and target must be on the same migration version after the target's boot migrations.
If the source is older, apply pending migrations to a **temporary copy** of the source
(SQLite) or refuse with instructions (Postgres: start the old backend once to migrate it).
Never migrate the original source in place during an import.

---

## Docker & docs

- One image supports both backends. `pg` is pure JS, so no extra native build step.
- `docker-compose.yml` stays SQLite-only (the default path).
- Add `docker-compose.postgres.yml`: app + `postgres:17` with a healthcheck, named volume,
  and `depends_on: condition: service_healthy`.
- README gets a "Choosing a database" section: SQLite recommended for single-user/Pi;
  Postgres if you already run it or want external backups. Include a Raspberry Pi note that
  Postgres adds RAM overhead.

---

## Testing & CI

- Integration/repo tests run against **both** dialects:
  - SQLite: temp file DB per test run.
  - Postgres: GitHub Actions `services: postgres:17`; locally via `docker compose -f docker-compose.test.yml`.
- CI job matrix: `db: [sqlite, postgres]` for integration tests; unit tests run once.
- Schema parity test (see above) runs in the unit suite.
- Migration test: apply all migrations from empty for each dialect, then run the seed script.
- Playwright smoke test runs on SQLite only (Postgres covered by integration tests).
- Copy engine tests (Phase 4): seed a SQLite DB → import into Postgres → assert identical
  rows and IDs; then Postgres → SQLite; plus failure cases (non-empty target, count
  mismatch triggers rollback, source left unmodified).

---

## Changes to existing docs

**CLAUDE.md — replace the Database row in the stack table with:**

> | Database | SQLite (better-sqlite3, default) **or** PostgreSQL (pg), selected by `DATABASE_URL`; Drizzle ORM with separate per-dialect schema trees and migration folders. Follow `docs/addendum-01-postgres-support.md`. |

**CLAUDE.md — add under Conventions:**

> - Database portability rules in `docs/addendum-01-postgres-support.md` are mandatory for every schema and query change.

**ROADMAP.md — add:**

### Phase 0.5 — Dual database support
- [ ] `DATABASE_URL` parsing + dialect detection; replace `DATABASE_PATH`
- [ ] Per-dialect schema trees (auth + settings tables) and migration folders
- [ ] `withTransaction()` helper; repo layer for existing settings/auth access
- [ ] Advisory-lock-guarded migrations on Postgres
- [ ] Schema parity test; CI matrix (sqlite + postgres) for integration tests
- [ ] `docker-compose.postgres.yml`; README "Choosing a database"
- ✅ Fresh install works on both backends; CI green on both; switching is only an env change on an empty DB.

**ROADMAP.md — amend later phases:**
- Phase 1: every new table lands in both schema trees with both migrations; repos tested on both.
- Phase 4: add the shared copy engine, the in-app "Import existing library" startup flow,
  the `db:copy` CLI (both directions, with `--dry-run`), `MIGRATE_FROM_URL`, and document
  `pg_dump` for Postgres backups. ✅ Switching SQLite → Postgres is: change `DATABASE_URL`,
  restart, confirm import, log in — with all data and images intact.
- Phase 5: implement `SearchIndex` for FTS5 and Postgres; performance check on both.
