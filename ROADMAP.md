# 33rpm Roadmap

Each phase ends in a working, deployable app. Work top to bottom; stop for review after each
phase. Tick boxes as items land. Items discovered mid-phase go into the right phase below.

Legend: **Goal** · deliverables · ✅ acceptance criteria

---

## Phase 0 — Foundation
**Goal:** An empty but real app that builds, runs in Docker on a Pi, and lets me log in.

- [x] Next.js + TypeScript (strict) + Tailwind + shadcn/ui scaffold
- [x] ESLint, Prettier, Vitest, Playwright configured; `lint`, `typecheck`, `test` scripts
- [x] Zod-validated env (`src/env.ts`) + `.env.example`
- [x] Drizzle + SQLite wired to `/data/33rpm.db`; migrations run on container start
- [x] Auth: generic OIDC provider + local admin fallback (first-run setup screen)
- [x] App shell: sidebar/tab bar nav (Library, Wishlist, Add, Stats, Settings), dark mode default
- [x] Settings page: Discogs token, default currency, user profile
- [x] Multi-stage Dockerfile, non-root user, healthcheck endpoint (`/api/health`)
- [x] `docker-compose.yml` example with `/data` volume
- [x] GitHub Actions: lint/typecheck/test on PR; build + push multi-arch image to GHCR on tag
- [x] README skeleton (what it is, quick start, env vars)

✅ `docker compose up` on an arm64 host serves the app; OIDC login works; CI is green.

---

## Phase 0.5 — Dual database support
**Goal:** SQLite and PostgreSQL as peer backends, selected by `DATABASE_URL`. See `docs/addendum-01-postgres-support.md`.

- [x] `DATABASE_URL` parsing + dialect detection; replace `DATABASE_PATH`
- [x] Per-dialect schema trees (auth + settings tables) and migration folders
- [x] `withTransaction()` helper; repo layer for existing settings/auth access
- [x] Advisory-lock-guarded migrations on Postgres
- [x] Schema parity test; CI matrix (sqlite + postgres) for integration tests
- [x] `docker-compose.postgres.yml`; README "Choosing a database"
- [x] Admin CLI bundled as `dist/cli.js` (`docker exec 33rpm node dist/cli.js …`), using the repo layer so it works on both backends:
  - `reset-password <email>` — prompts for a new password (or generates and prints a temporary one), updates it via Better Auth's hasher, revokes all of that user's sessions
  - `create-setup-code` — prints a fresh first-run setup code; refuses if any user exists
- [x] README "Recovery" section documenting both commands

✅ Fresh install works on both backends; CI green on both; switching is only an env change on an empty DB.

---

## Phase 1 — Catalog core
**Goal:** Add items by search and see them in a good-looking library.

- [x] Full schema: Artist, Master, Release, Copy, WishlistItem, Location, Tag (+ join tables), all with `userId`
- [x] `MetadataProvider` interface; Discogs + MusicBrainz/Cover Art Archive implementations
- [x] Rate-limited fetch queue per provider; response caching; image cache on disk
- [x] Add flow: text search (artist/title), barcode typed in, catalog number → candidate list showing cover, format, label, catno, year, country → pick exact release → create Copy
- [x] "Add another copy" and "Add a different edition" from an album page
- [x] Manual entry for unknown items (with optional cover upload)
- [x] Library views: Albums grid, Artists, Formats, Locations, Recently Added
- [x] Album (Master) page: big art, tracklist, my copies, other editions, Discogs/MB links, attribution
- [x] Copy edit: Goldmine conditions, price/date/source, location, notes, tags, photos
- [x] Duplicate warning when adding a release I already own
- [x] Seed script (~20 sample releases across formats) for dev
- [x] Every new table lands in both schema trees (SQLite + Postgres) with both migrations; repos tested on both

✅ I can search "Rumours", choose the exact pressing I own, set its condition and shelf, and see it in the grid within seconds. Works with no Discogs token (MusicBrainz only).

---

## Phase 2 — Scanning & mobile
**Goal:** Catalog a whole crate from my phone in one sitting.

- [x] PWA manifest, icons ("33" record-label icon), offline shell, installable on iOS/Android
- [x] Camera barcode scanning via `@zxing/browser` (requires HTTPS — document this)
- [x] **Crate mode:** continuous scanning; each scan queues a lookup; review/confirm queue afterwards; ambiguous matches flagged
- [x] Haptic/audio feedback on scan; manual barcode fallback
- [x] Mobile layout pass on all Phase 1 screens

✅ Scanning 25 CDs in crate mode takes a few minutes, and I only confirm the ambiguous ones.

---

## Phase 3 — Wishlist
**Goal:** Track what I'm hunting and move it into the collection when I find it.

- [x] Wishlist targets a Master ("any edition") or a specific Release
- [x] Add to wishlist from search results, album pages, and scan results ("don't own → want")
- [x] Priority, max price, notes, status (wanted / ordered / acquired)
- [x] One-tap "Got it" → creates Copy (prompts for exact release if wishlist item was a Master)
- [x] Wishlist views: by priority, by artist, by format
- [x] In-store check: scanning an item tells me "already own it" / "on your wishlist" / "new"

✅ In a record store, I scan a barcode and instantly know whether I own it or want it.

---

## Phase 4 — Import, export & backup
**Goal:** Bring my existing data in; never lose it.

- [x] Discogs import: collection (with folders → Locations/Tags, conditions, notes) and wantlist
- [x] Re-sync from Discogs (idempotent; no duplicates; report of added/updated/skipped)
- [x] CSV import with column mapping (covers MusicBuddy/CLZ-style exports)
- [x] CSV + JSON export of everything
- [x] Automatic nightly SQLite snapshots in `/data/backups` (retention configurable)
- [x] Restore-from-backup docs
- [x] Shared copy engine (`src/db/copy/`) used by DB switching and JSON export/import
- [x] In-app "Import existing library" startup flow (setup-code protected; `MIGRATE_FROM_URL` or default SQLite file when on Postgres)
- [x] `db:copy` CLI, both directions (SQLite ⇄ Postgres), with `--dry-run`
- [x] Document `pg_dump` for Postgres backups

✅ A Discogs collection of 500+ items imports unattended within rate limits, and a re-run changes nothing.
✅ Switching SQLite → Postgres is: change `DATABASE_URL`, restart, confirm import, log in — with all data and images intact.

---

## Phase 5 — Polish & stats → **v1.0 public release**
**Goal:** Something I'm proud to make public.

- [x] Global search (instant, across artists/titles/labels/catno/tags)
- [x] Filters + sort on every library view (format, genre, decade, condition, location, tag, price)
- [x] Stats dashboard: counts by format/genre/decade/label, spend over time, recently added
- [x] Empty states, loading skeletons, error handling, toasts
- [x] `SearchIndex` implementations for SQLite (FTS5) and Postgres (tsvector + pg_trgm)
- [ ] Performance check on a Pi 5 with 2,000+ items, on both SQLite and Postgres — benchmark tool and x86 numbers in `docs/performance.md`; run `node dist/bench.js` on a Pi to finish
- [x] Docs: full README with screenshots, Portainer stack example, reverse-proxy/HTTPS notes, Discogs token how-to, backup/restore
- [ ] Choose and add LICENSE (MIT vs AGPL-3.0); replace the README license badge placeholder
- [x] CONTRIBUTING.md, PR/issue templates, SECURITY.md (landed early with repo conventions)
- [x] Docker image hardening: remove npm/npx/corepack from the runtime stage (Trivy flags HIGH CVEs in the base image's bundled npm; the app never uses it at runtime)
- [ ] Release `v1.0.0` via release-please (`Release-As: 1.0.0`), publish image

✅ A stranger can go from README to a running instance with their Discogs collection imported.

---

## Phase 6 — Integrations (post-1.0)
- [ ] Wishlist price watch via Discogs marketplace stats; alert when below max price
- [ ] Notifications: generic webhook + ntfy
- [ ] Shareable read-only wishlist link (gift list), revocable
- [ ] Play log ("Now spinning") + optional Last.fm scrobbling
- [ ] Home Assistant: "now spinning" webhook/sensor
- [ ] Lidarr: flag items I also own digitally; optionally add missing albums to Lidarr
- [ ] Estimated collection value (Discogs marketplace data), opt-in

## Phase 7 — Platform (later)
- [ ] Multi-user / household with per-user or shared collections and wishlists
- [ ] Personal API tokens + documented REST API
- [ ] MCP server so AI assistants can answer "do I own this?" / "add to wishlist"
- [ ] User management UI (create/invite additional users; today the first admin comes from `/setup` and others only via `OIDC_AUTO_SIGNUP`)
- [ ] Cover-art photo recognition (identify a release from a photo of the sleeve)
- [ ] Other physical media formats as plugins (if ever wanted)

---

## Parking lot
_Ideas not yet assigned to a phase._

- Adopt ESLint 10 once `eslint-config-next` ships plugins that support it (`eslint-plugin-react`, `-import` and `-jsx-a11y` stop at ESLint 9); remove the Dependabot ignore rule then.
- Adopt TypeScript 7 (native compiler) once typescript-eslint supports it ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)); remove the Dependabot ignore rule then. TS 7 already passes typecheck and `next build` here, about 3× faster.
