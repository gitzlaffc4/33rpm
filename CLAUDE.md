# 33rpm — Project Context for Claude Code

33rpm is a self-hosted web app (installable PWA) for cataloging a personal physical music
collection — vinyl, CDs, cassettes, and other formats — plus a wishlist of what I'm hunting.
The goal is a fast, cover-art-forward library that feels like a modern music app, but every
item is a real object on a real shelf.

This repo will be public. Never commit secrets, personal hostnames, IPs, tokens, or real
collection data. All config comes from environment variables.

The phased plan lives in `ROADMAP.md`. Work one phase at a time (see "How to work" below).

---

## Tech stack (decided — don't swap without asking)

| Concern | Choice |
|---|---|
| Framework | Next.js (current stable, App Router) + TypeScript (strict) |
| UI | Tailwind CSS + shadcn/ui, lucide icons |
| Database | SQLite (better-sqlite3, default) **or** PostgreSQL (pg), selected by `DATABASE_URL`; Drizzle ORM with separate per-dialect schema trees and migration folders. Follow `docs/addendum-01-postgres-support.md`. |
| Auth | Better Auth (or Auth.js if materially simpler) — generic OIDC provider + local admin fallback |
| Barcode scanning | `@zxing/browser` (iOS Safari lacks reliable `BarcodeDetector`) |
| Background work | In-process queue with per-provider rate limiting (e.g. p-queue). No Redis. |
| Validation | Zod for env, API input, and provider responses |
| Testing | Vitest (unit/integration), Playwright (a few critical-path e2e) |
| Packaging | Single Docker image, multi-arch (linux/amd64 + linux/arm64), published to GHCR via GitHub Actions |
| Target hardware | Must run comfortably on a Raspberry Pi 5 (4–8 GB RAM) |

Persistent state lives in one mounted volume, `/data`:
```
/data/33rpm.db        SQLite database
/data/images/         cached cover art + user-uploaded photos
/data/backups/        automatic DB snapshots
```

---

## Domain model

Mirror the Discogs hierarchy — this is the core design decision:

- **Artist** — name, sort name, external IDs.
- **Master** — the abstract album/work ("Rumours"). Title, artists, year, genres, styles, cover.
- **Release** — a specific edition/pressing of a Master. Format (vinyl/CD/cassette/other) and
  format details (LP, 2xLP, 7", 180g, colored vinyl, SACD, box set…), label, catalog number,
  barcode(s), country, release year, tracklist, Discogs release ID, MusicBrainz release ID.
- **Copy** — a physical item I own. FK to Release. Media condition + sleeve condition
  (Goldmine scale: M, NM, VG+, VG, G+, G, F, P), purchase price, currency, date, source/store,
  storage location (shelf/crate), notes, photos, rating, tags.
- **WishlistItem** — targets EITHER a Master ("any edition") OR a specific Release.
  Priority (1–3), max price, notes, date added, status (wanted / ordered / acquired).
- **Location** — user-defined shelves/crates/rooms for physical lookup.
- **Tag** — free-form, many-to-many with Copy and WishlistItem.
- **PlayLog** — Copy + timestamp (Phase 6).
- **User** — all user-owned rows carry `userId` from day one, even though v1 is effectively
  single-user. This keeps multi-user/household support a non-migration later.

Rules:
- Multiple Copies of the same Release are allowed (and must be easy to add).
- Multiple Releases of the same Master are normal (CD + vinyl of the same album).
- A Release can exist without a Copy (fetched during search, linked to a wishlist item, etc.).
- Manual entry must be possible for items no metadata provider knows about.

---

## Metadata providers

Implement a provider interface so sources are pluggable:

```ts
interface MetadataProvider {
  searchByBarcode(code: string): Promise<ReleaseCandidate[]>;
  searchByCatalogNumber(catno: string): Promise<ReleaseCandidate[]>;
  searchByText(query: string, opts?: { format?: Format }): Promise<ReleaseCandidate[]>;
  getRelease(id: string): Promise<ReleaseDetail>;
  getMaster?(id: string): Promise<MasterDetail>;
}
```

- **Discogs (primary)** — personal access token from env/settings. Authenticated limit is
  ~60 req/min; honor `X-Discogs-Ratelimit-*` headers. Send a descriptive User-Agent
  (`33rpm/<version> +<repo-url>`). Show "Data provided by Discogs" attribution wherever
  Discogs data is displayed, per their API terms.
- **MusicBrainz (fallback / no-token mode)** — 1 req/sec max, descriptive User-Agent required.
  Cover art from the Cover Art Archive.
- Cache provider responses in the DB and images on disk. Never re-fetch on page view.
  "Refresh metadata" is an explicit user action.
- The app must be usable with zero tokens configured (MusicBrainz only).

---

## Conventions

- Server Components by default; Server Actions for mutations; route handlers only where an
  HTTP API is genuinely needed (PWA scanning, imports, future integrations).
- Keep provider/integration code in `src/lib/providers/*` and `src/lib/integrations/*`,
  isolated from UI.
- Env vars validated at startup with Zod (`src/env.ts`); every var documented in
  `.env.example` and the README.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…). Small, focused commits.
- Mobile-first. Dark mode is the default. Album art is the hero of every screen.
- Accessibility: keyboard-navigable, labeled controls, sufficient contrast.
- No telemetry, no external calls except the configured metadata/integration providers.
- Database portability rules in `docs/addendum-01-postgres-support.md` are mandatory for every schema and query change.

---

## Git conventions

Full details in `CONTRIBUTING.md`. Follow these in every session:

- **Branches:** `<type>/<short-kebab-desc>` with types `feat`, `fix`, `chore`, `docs`, `refactor`,
  `test`, `ci`, `deps`, `perf`. Phase work: `feat/phase-<n>-<slug>`. If the environment forces a
  prefix (e.g. `claude/`), keep it and append the conventional part: `claude/feat-phase-0.5-dual-db`.
- **Commits:** Conventional Commits 1.0, scopes where useful (`db`, `auth`, `ui`, `docker`, `ci`,
  `deps`, `providers`, …). Breaking changes use `!` plus a `BREAKING CHANGE:` footer.
- **PRs:** squash-merge only; the PR title becomes the commit on `main`, so it must be a
  Conventional Commit. Put `BREAKING CHANGE:` / `Release-As:` footers in the PR description.
- **Versions:** never bump `package.json` or edit `CHANGELOG.md` by hand; release-please owns both.
- **Workflows:** top-level `permissions: contents: read`; pin third-party actions to full commit
  SHAs with a `# vX.Y.Z` comment; add concurrency groups. Hooks aren't used (`ignore-scripts`);
  CI enforces commitlint and PR titles.

---

## How to work

1. Read `ROADMAP.md` and work on the **current phase only**.
2. Before writing code for a phase, post a short plan (files, schema changes, open questions)
   and wait for my OK if anything is ambiguous.
3. Build in small commits. Keep `npm run lint`, `npm run typecheck`, and `npm test` green.
4. At the end of a phase: tick the boxes in `ROADMAP.md`, update README/docs if behavior
   changed, summarize what was done and anything deferred, then **stop for review**.
5. If you discover something that belongs in a later phase, add it to `ROADMAP.md` under
   that phase instead of building it now.
6. Never commit `.env`, database files, `/data`, or real collection exports.
