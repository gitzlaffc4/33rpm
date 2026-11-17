# 33rpm Roadmap

Each phase ends in a working, deployable app. Work top to bottom; stop for review after each
phase. Tick boxes as items land. Items discovered mid-phase go into the right phase below.

Legend: **Goal** · deliverables · ✅ acceptance criteria

---

## Phase 0 — Foundation
**Goal:** An empty but real app that builds, runs in Docker on a Pi, and lets me log in.

- [ ] Next.js + TypeScript (strict) + Tailwind + shadcn/ui scaffold
- [ ] ESLint, Prettier, Vitest, Playwright configured; `lint`, `typecheck`, `test` scripts
- [ ] Zod-validated env (`src/env.ts`) + `.env.example`
- [ ] Drizzle + SQLite wired to `/data/33rpm.db`; migrations run on container start
- [ ] Auth: generic OIDC provider + local admin fallback (first-run setup screen)
- [ ] App shell: sidebar/tab bar nav (Library, Wishlist, Add, Stats, Settings), dark mode default
- [ ] Settings page: Discogs token, default currency, user profile
- [ ] Multi-stage Dockerfile, non-root user, healthcheck endpoint (`/api/health`)
- [ ] `docker-compose.yml` example with `/data` volume
- [ ] GitHub Actions: lint/typecheck/test on PR; build + push multi-arch image to GHCR on tag
- [ ] README skeleton (what it is, quick start, env vars)

✅ `docker compose up` on an arm64 host serves the app; OIDC login works; CI is green.

---

## Phase 0.5 — Dual database support
**Goal:** SQLite and PostgreSQL as peer backends, selected by `DATABASE_URL`. See `docs/addendum-01-postgres-support.md`.

- [ ] `DATABASE_URL` parsing + dialect detection; replace `DATABASE_PATH`
- [ ] Per-dialect schema trees (auth + settings tables) and migration folders
- [ ] `withTransaction()` helper; repo layer for existing settings/auth access
- [ ] Advisory-lock-guarded migrations on Postgres
- [ ] Schema parity test; CI matrix (sqlite + postgres) for integration tests
- [ ] `docker-compose.postgres.yml`; README "Choosing a database"

✅ Fresh install works on both backends; CI green on both; switching is only an env change on an empty DB.

---

## Phase 1 — Catalog core
**Goal:** Add items by search and see them in a good-looking library.

- [ ] Full schema: Artist, Master, Release, Copy, WishlistItem, Location, Tag (+ join tables), all with `userId`
- [ ] `MetadataProvider` interface; Discogs + MusicBrainz/Cover Art Archive implementations
- [ ] Rate-limited fetch queue per provider; response caching; image cache on disk
- [ ] Add flow: text search (artist/title), barcode typed in, catalog number → candidate list showing cover, format, label, catno, year, country → pick exact release → create Copy
- [ ] "Add another copy" and "Add a different edition" from an album page
- [ ] Manual entry for unknown items (with optional cover upload)
- [ ] Library views: Albums grid, Artists, Formats, Locations, Recently Added
- [ ] Album (Master) page: big art, tracklist, my copies, other editions, Discogs/MB links, attribution
- [ ] Copy edit: Goldmine conditions, price/date/source, location, notes, tags, photos
- [ ] Duplicate warning when adding a release I already own
- [ ] Seed script (~20 sample releases across formats) for dev
- [ ] Every new table lands in both schema trees (SQLite + Postgres) with both migrations; repos tested on both

✅ I can search "Rumours", choose the exact pressing I own, set its condition and shelf, and see it in the grid within seconds. Works with no Discogs token (MusicBrainz only).

---

## Phase 2 — Scanning & mobile
**Goal:** Catalog a whole crate from my phone in one sitting.

- [ ] PWA manifest, icons ("33" record-label icon), offline shell, installable on iOS/Android
- [ ] Camera barcode scanning via `@zxing/browser` (requires HTTPS — document this)
- [ ] **Crate mode:** continuous scanning; each scan queues a lookup; review/confirm queue afterwards; ambiguous matches flagged
- [ ] Haptic/audio feedback on scan; manual barcode fallback
- [ ] Mobile layout pass on all Phase 1 screens

✅ Scanning 25 CDs in crate mode takes a few minutes, and I only confirm the ambiguous ones.

---

## Phase 3 — Wishlist
**Goal:** Track what I'm hunting and move it into the collection when I find it.

- [ ] Wishlist targets a Master ("any edition") or a specific Release
- [ ] Add to wishlist from search results, album pages, and scan results ("don't own → want")
- [ ] Priority, max price, notes, status (wanted / ordered / acquired)
- [ ] One-tap "Got it" → creates Copy (prompts for exact release if wishlist item was a Master)
- [ ] Wishlist views: by priority, by artist, by format
- [ ] In-store check: scanning an item tells me "already own it" / "on your wishlist" / "new"

✅ In a record store, I scan a barcode and instantly know whether I own it or want it.

---

## Phase 4 — Import, export & backup
**Goal:** Bring my existing data in; never lose it.

- [ ] Discogs import: collection (with folders → Locations/Tags, conditions, notes) and wantlist
- [ ] Re-sync from Discogs (idempotent; no duplicates; report of added/updated/skipped)
- [ ] CSV import with column mapping (covers MusicBuddy/CLZ-style exports)
- [ ] CSV + JSON export of everything
- [ ] Automatic nightly SQLite snapshots in `/data/backups` (retention configurable)
- [ ] Restore-from-backup docs
- [ ] Shared copy engine (`src/db/copy/`) used by DB switching and JSON export/import
- [ ] In-app "Import existing library" startup flow (setup-code protected; `MIGRATE_FROM_URL` or default SQLite file when on Postgres)
- [ ] `db:copy` CLI, both directions (SQLite ⇄ Postgres), with `--dry-run`
- [ ] Document `pg_dump` for Postgres backups

✅ A Discogs collection of 500+ items imports unattended within rate limits, and a re-run changes nothing.
✅ Switching SQLite → Postgres is: change `DATABASE_URL`, restart, confirm import, log in — with all data and images intact.

---

## Phase 5 — Polish & stats → **v1.0 public release**
**Goal:** Something I'm proud to make public.

- [ ] Global search (instant, across artists/titles/labels/catno/tags)
- [ ] Filters + sort on every library view (format, genre, decade, condition, location, tag, price)
- [ ] Stats dashboard: counts by format/genre/decade/label, spend over time, recently added
- [ ] Empty states, loading skeletons, error handling, toasts
- [ ] `SearchIndex` implementations for SQLite (FTS5) and Postgres (tsvector + pg_trgm)
- [ ] Performance check on a Pi 5 with 2,000+ items, on both SQLite and Postgres
- [ ] Docs: full README with screenshots, Portainer stack example, reverse-proxy/HTTPS notes, Discogs token how-to, backup/restore
- [ ] Choose and add LICENSE (MIT vs AGPL-3.0), CONTRIBUTING.md, issue templates
- [ ] Tag `v1.0.0`, publish image

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
- [ ] Cover-art photo recognition (identify a release from a photo of the sleeve)
- [ ] Other physical media formats as plugins (if ever wanted)

---

## Parking lot
_Ideas not yet assigned to a phase._

-
