# 33rpm

[![CI](https://github.com/gitzlaffc4/33rpm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/gitzlaffc4/33rpm/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/gitzlaffc4/33rpm?include_prereleases&sort=semver)](https://github.com/gitzlaffc4/33rpm/releases)
[![CodeQL](https://github.com/gitzlaffc4/33rpm/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/gitzlaffc4/33rpm/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/gitzlaffc4/33rpm/badge)](https://securityscorecards.dev/viewer/?uri=github.com/gitzlaffc4/33rpm)
[![License: TBD](https://img.shields.io/badge/license-TBD-lightgrey)](ROADMAP.md)

33rpm is a self-hosted library for your physical music collection. Scan barcodes or search by title to add the exact pressing, track condition and shelf location, and keep a wishlist of what you're hunting. Discogs + MusicBrainz metadata, Docker-ready, runs on a Raspberry Pi.

> **Status:** early development. Phase 0 (foundation: auth, app shell, settings, Docker, CI) is
> in place; cataloging arrives in Phase 1. See [ROADMAP.md](ROADMAP.md).

- One container, one volume (`/data`), SQLite by default. No Redis, no external services.
- Sign in with a local admin account and/or any OpenID Connect provider (Authentik, Authelia,
  Keycloak, Pocket ID, Zitadel, …).
- Multi-arch image (`linux/amd64`, `linux/arm64`) that runs comfortably on a Raspberry Pi 5.
- No telemetry. The only outbound calls are to the metadata providers you use.

---

## Quick start (Docker Compose)

```bash
mkdir 33rpm && cd 33rpm
curl -fsSLO https://raw.githubusercontent.com/gitzlaffc4/33rpm/main/docker-compose.yml
curl -fsSL -o .env https://raw.githubusercontent.com/gitzlaffc4/33rpm/main/.env.example
```

Edit `.env`: set `APP_URL` to the address you'll use, and generate a secret:

```bash
echo "AUTH_SECRET=$(openssl rand -base64 32)" >> .env
```

Start it:

```bash
docker compose up -d
```

### First run

Until an admin account exists, 33rpm prints a **one-time setup code** to its logs on every start:

```bash
docker compose logs 33rpm | grep -A2 "setup code"
```

Open `APP_URL/setup`, enter the code, and create the admin account. The code is invalidated as soon
as the admin exists; restarting the container before then prints a fresh one.

---

## Adding to your collection

Open **Add** and type an artist and title, a barcode, or a catalog number (auto-detected, or
pick the mode). Results show cover, format, label, catalog number, country and year so you can
choose the exact pressing; a badge marks releases you already own. Pick one, set its condition
(Goldmine scale), price, date, source, shelf and tags, and it lands in your library.

- **Album page:** big art, tracklist, your copies grouped by edition, other editions in the
  catalog, links to Discogs/MusicBrainz, and **Add another copy** / **Add a different edition**.
- **Manual entry** covers anything no provider knows about, with an optional cover upload.
- **Copies** can be edited later and given photos (wear, inserts, matrix etchings).
- **Library views:** Albums, Artists, Formats, Locations (manage shelves/crates there) and
  Recently added, with filtering and sorting.

### Metadata sources and network access

| Host | Used for |
| --- | --- |
| `musicbrainz.org` | Search and release details (always; max 1 request/second) |
| `coverartarchive.org`, `*.archive.org` | Cover art for MusicBrainz releases |
| `api.discogs.com`, `i.discogs.com` | Search, details and covers, only when a Discogs token is set |

Responses are cached in the database and covers are stored once as WebP (600 and 1200 px) under
`/data/images`; pages never trigger provider calls. **Refresh metadata** on an album page is the
only way to re-fetch. Search thumbnails are proxied through the app, so browsers never contact
third parties.

If the server reaches the internet through an HTTP(S) proxy, set `NODE_USE_ENV_PROXY=1` along
with `HTTPS_PROXY` (Node's `fetch` ignores proxy variables otherwise).

## Scanning & the phone app

33rpm is an installable web app (PWA). On your phone, open it and choose **Add to Home Screen**
(iOS Safari: Share → Add to Home Screen; Android Chrome: menu → Install app). It opens
full-screen; without a connection it shows an offline page (your library itself always lives on
the server, so nothing private is cached on the device).

- **Scan** (Add → Scan) uses the camera to read EAN/UPC barcodes, with a beep and a buzz on
  each hit. You can always type the barcode instead.
- **Crate mode** keeps the camera running: scan item after item, and each barcode is looked
  up in the background (barcodes already in your catalog resolve instantly). Then open
  **Review & add**: single matches are pre-selected, barcodes shared by several pressings ask
  you to pick one, unknown ones link to manual entry, and one condition/location applies to
  everything you add. Lookups that were still running when the server restarted resume on
  startup.

> **The camera needs HTTPS.** Browsers only allow camera access on secure origins
> (`https://…`, or `http://localhost`). Over plain `http://` on your LAN, scanning is
> disabled and you can type barcodes instead. Put 33rpm behind a reverse proxy with a
> certificate (see [Reverse proxy & HTTPS](#reverse-proxy--https)).

## Configuration

All configuration is via environment variables (see [`.env.example`](.env.example)). Invalid
configuration stops the server at startup with a message naming the variable.

| Variable              | Default                          | Description                                                                                                                                                                 |
| --------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`             | **required**                     | Public URL of the app, e.g. `https://music.example.com`. `https://` ⇒ cookies are marked `Secure`.                                                                         |
| `AUTH_SECRET`         | **required**                     | At least 32 random characters. Signs sessions. `openssl rand -base64 32`.                                                                                                   |
| `DATA_DIR`            | `/data` (dev: `./data`)          | Database, cached images (`images/`) and backups (`backups/`).                                                                                                               |
| `DATABASE_URL` | `file:${DATA_DIR}/33rpm.db` | `file:<path>` for SQLite, or `postgres://user:pass@host:5432/db` for PostgreSQL. See [Choosing a database](#choosing-a-database). |
| `DATABASE_SSL` | follow the URL | PostgreSQL TLS: `true` (encrypt + verify), `require` (encrypt, don't verify), `false`. |
| `DATABASE_POOL_MAX` | `10` | PostgreSQL connection pool size. |
| `ENCRYPTION_KEY`      | derived from `AUTH_SECRET`       | At least 32 chars. Encrypts secrets stored in the DB (Discogs token). Changing the key in use means re-entering stored tokens.                                               |
| `PUID` / `PGID`       | `1000` / `1000`                  | Docker only. The uid/gid the app runs as; `/data` is made owned by it.                                                                                                      |
| `AUTH_LOCAL_LOGIN`    | `true`                           | Email/password sign-in for local accounts. `false` requires OIDC.                                                                                                           |
| `OIDC_ISSUER`         | —                                | Issuer URL of your IdP (discovery at `/.well-known/openid-configuration`). Set with the next two to enable SSO.                                                             |
| `OIDC_CLIENT_ID`      | —                                | OIDC client ID.                                                                                                                                                             |
| `OIDC_CLIENT_SECRET`  | —                                | OIDC client secret.                                                                                                                                                         |
| `OIDC_PROVIDER_NAME`  | `SSO`                            | Button label: “Sign in with …”.                                                                                                                                             |
| `OIDC_SCOPES`         | `openid profile email`           | Space- or comma-separated scopes.                                                                                                                                           |
| `OIDC_AUTO_SIGNUP`    | `false`                          | Create an account when an unknown IdP user signs in. Off: SSO only signs in existing accounts.                                                                              |
| `OIDC_ALLOWED_EMAILS` | — (allow all)                    | Comma-separated addresses and/or `@domains` allowed to sign in, link or sign up via SSO.                                                                                    |
| `TRUSTED_PROXIES`     | —                                | IPs/CIDRs of your reverse proxies, used to find the client IP in `X-Forwarded-For` chains.                                                                                  |
| `IP_ADDRESS_HEADERS`  | `x-forwarded-for`                | Header(s) carrying the client IP, e.g. `cf-connecting-ip` or `x-real-ip`.                                                                                                   |
| `DISCOGS_TOKEN`       | —                                | Default Discogs personal access token. A token saved in Settings overrides it. Without any token, 33rpm uses MusicBrainz only.                                              |
| `PORT` / `HOSTNAME`   | `3000` / `0.0.0.0`               | Listen address (set in the image).                                                                                                                                          |

---

## Data volume & permissions

Everything persistent lives in `/data`:

```
/data/33rpm.db        SQLite database
/data/images/         cached cover art + uploaded photos
/data/backups/        automatic DB snapshots
```

The container starts as root only long enough to create these directories and `chown` them
(non-recursively) to `PUID:PGID`, then runs the app as that user. It never runs the app as root
and refuses `PUID=0`.

- **Bind mount (`./data:/data`):** set `PUID`/`PGID` to the owner of the host directory
  (`id -u`, `id -g`).
- **Running with `user:` / `--user`:** the entrypoint changes nothing and only checks access. Make
  the host directory writable by that uid first.
- **Changed `PUID` later, or the directory was created by another user?** Fix existing files on
  the host: `sudo chown -R 1000:1000 ./data` (with your uid/gid).

If `/data` isn't writable, the container exits immediately with a message saying which uid needs
access and how to fix it.

---

## Reverse proxy & HTTPS

Run 33rpm behind a reverse proxy (Caddy, Traefik, nginx, Nginx Proxy Manager, Cloudflare Tunnel)
for HTTPS. Barcode scanning (Phase 2) requires HTTPS on phones.

1. **Set `APP_URL` to the public `https://` URL.** Cookie security follows it: with `https://`
   session cookies are `Secure` and `__Secure-`-prefixed, even though the proxy talks plain HTTP
   to the container.
2. **Forward the original `Host` header** (default in Caddy/Traefik; in nginx use
   `proxy_set_header Host $host;`). Next.js server actions reject requests whose `Origin` doesn't
   match the forwarded host.
3. **Tell 33rpm where the client IP is**, so sign-in rate limiting is per-client rather than per
   proxy:
   - The proxy *appends* to `X-Forwarded-For` (Caddy, Traefik, nginx with
     `$proxy_add_x_forwarded_for`): set `TRUSTED_PROXIES` to the proxy's IP or Docker network
     (e.g. `172.18.0.0/16`). 33rpm walks the chain right to left, skipping trusted hops.
   - The proxy *sets* a single-value header: point `IP_ADDRESS_HEADERS` at it
     (`cf-connecting-ip` for Cloudflare, `x-real-ip` for nginx's `proxy_set_header X-Real-IP`).
4. **Don't also expose port 3000 publicly.** Forwarded headers can only be trusted if clients can't
   reach the container directly. Bind it to localhost or a private network, or drop `ports:` and
   let the proxy reach it over a Docker network.

On plain HTTP (e.g. `http://pi.local:3000` on a trusted LAN) everything works, but cookies aren't
`Secure` and 33rpm logs a warning at startup.

---

## Single sign-on (OIDC)

1. In your IdP, create an OIDC client (confidential, authorization code flow) with redirect URI
   **`<APP_URL>/api/auth/callback/oidc`**.
2. Set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` and restart. A “Sign in with …”
   button appears on the login page.

PKCE is always used, and ID tokens are verified against the IdP's published keys.

**How SSO identities map to 33rpm accounts:**

- **Already linked:** signs in.
- **Same email as an existing account:** linked automatically **only if the IdP asserts
  `email_verified=true`**. Otherwise sign in with your password and use **Settings → Connect
  SSO**, which links explicitly (the IdP email may differ from your 33rpm email). Both paths still
  require a verified email from the IdP.
- **Unknown user:** rejected unless `OIDC_AUTO_SIGNUP=true`.
- **`OIDC_ALLOWED_EMAILS`**, if set, is checked on every SSO sign-in, link and sign-up.

**SSO-only:** once your account shows SSO under Settings → Profile, set `AUTH_LOCAL_LOGIN=false`.

---

## Choosing a database

33rpm runs on **SQLite** (the default) or **PostgreSQL**, picked by `DATABASE_URL` at startup.
Both are fully supported and tested in CI.

|                  | SQLite (default)                                   | PostgreSQL                                              |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------- |
| Best for         | One container, Raspberry Pi, most self-hosters     | You already run Postgres, or want external backups/HA   |
| Setup            | Nothing: `file:/data/33rpm.db` is the default      | `docker compose -f docker-compose.postgres.yml up -d`   |
| Resources        | No extra process                                   | A second container; plan roughly 100–200 MB more RAM on a Pi |
| Upgrade safety   | Automatic snapshot to `/data/backups` before migrations | Back up with `pg_dump` before upgrading (the app logs a reminder) |

Either way, keep the `/data` volume: cover art, photos and backups live there.

**PostgreSQL quick start:** add `POSTGRES_PASSWORD=<long random string>` to `.env`, then use
[`docker-compose.postgres.yml`](docker-compose.postgres.yml). It runs `postgres:17` next to the
app, waits for its healthcheck, and sets `DATABASE_URL` for you. Migrations run automatically on
startup, guarded by a Postgres advisory lock, so several replicas can start at once safely.

**Backups on PostgreSQL:**

```bash
docker exec 33rpm-db pg_dump -U 33rpm -Fc 33rpm > 33rpm-$(date +%F).dump
```

**Switching backends:** an existing library can't be moved between SQLite and PostgreSQL yet.
An in-app "Import existing library" step and a `db:copy` command are planned for Phase 4. Until
then, pick one backend for a fresh install.

---

## Recovery

The image includes an admin CLI. Run it with `docker exec`; it drops to `PUID:PGID` itself, so it
never leaves root-owned files behind:

```bash
docker exec -it 33rpm 33rpm help
```

**Locked out?** Reset a password. You're prompted for the new one; `--generate` prints a random
temporary password instead. Either way, all of that user's sessions are signed out, and an
SSO-only user gets a password login.

```bash
docker exec -it 33rpm 33rpm reset-password you@example.com
```

```bash
docker exec 33rpm 33rpm reset-password you@example.com --generate
```

**Lost the first-run setup code?** Print a fresh one. This only works while no users exist; any
earlier code stops working.

```bash
docker exec 33rpm 33rpm create-setup-code
```

From source, use `npm run build:cli` then `node dist/cli.js <command>` with the same environment
as the server. The CLI works on both SQLite and PostgreSQL, and expects the server to have started
at least once (so the database is migrated).

---

## Upgrading & backups

Pull the new image and restart. Database migrations run automatically on startup. If the
database already has data and a migration is pending, 33rpm first writes a consistent snapshot to
`/data/backups/33rpm-pre-migrate-<timestamp>.db` (the last 5 are kept). To roll back, stop the
container, copy a snapshot over `/data/33rpm.db` (removing any `33rpm.db-wal`/`-shm` files), and
start the previous image version.

Nightly snapshots and restore tooling are planned for Phase 4.

---

## Development

Requires Node.js 26 LTS (see `.nvmrc`).

```bash
npm ci
cp .env.example .env    # set APP_URL=http://localhost:3000 and an AUTH_SECRET
npm run dev             # http://localhost:3000; the setup code prints in this terminal
```

| Script                | What it does                                                                           |
| --------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`         | Dev server (data in `./data`).                                                         |
| `npm run build`       | Production build (`.next/standalone`).                                                 |
| `npm run lint`        | ESLint + Prettier check (`npm run format` to fix).                                     |
| `npm run typecheck`   | Route type generation + `tsc --noEmit`.                                                |
| `npm test`            | Vitest unit tests + integration tests (SQLite by default).                             |
| `npm run test:integration` | Integration tests only. Set `TEST_DATABASE_URL=postgres://…` to run them on PostgreSQL. |
| `npm run build:cli`   | Bundle the admin CLI to `dist/cli.js`.                                                 |
| `npm run test:e2e`    | Playwright smoke test against the production build (run `npm run build` first).       |
| `npm run db:seed`     | Add ~20 sample releases (generated covers) for the first user. Run setup first; `-- --force` to repeat. |
| `npm run db:generate` | Generate migrations for **both** dialects after changing `src/db/schema/{sqlite,pg}`. Migrations are committed. |

PostgreSQL integration tests locally:

```bash
docker compose -f docker-compose.test.yml up -d
```

```bash
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:54329/test npm run test:integration
```

Schema changes go in **both** trees (`src/db/schema/sqlite` and `src/db/schema/pg`) and both
migration folders; a unit test fails if they drift. See
[docs/addendum-01-postgres-support.md](docs/addendum-01-postgres-support.md).

Notes:

- `.npmrc` sets `ignore-scripts=true`: dependency install scripts never run. better-sqlite3 ships
  prebuilt binaries for every supported platform, so nothing needs compiling.
- To use an existing Chromium for e2e tests, set `PLAYWRIGHT_CHROMIUM_PATH`.
- Disable Next.js's own build telemetry locally with `export NEXT_TELEMETRY_DISABLED=1` (the
  Docker image and CI already do).

### Contributing & releases

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch and commit conventions (Conventional Commits,
squash merges) and the automated checks. Releases are cut by
[release-please](https://github.com/googleapis/release-please): merging its Release PR tags the
version, updates [CHANGELOG.md](CHANGELOG.md), and publishes a multi-arch image to
`ghcr.io/gitzlaffc4/33rpm`:

| Tag                   | What it is                                               |
| --------------------- | -------------------------------------------------------- |
| `latest`, `X`, `X.Y`  | Latest stable release                                    |
| `X.Y.Z`               | A specific release (including `X.Y.Z-alpha.N` pre-releases) |
| `edge`                | Latest commit on `main` (may be unstable)                |

Images include an SBOM and signed build provenance; verify with
`gh attestation verify oci://ghcr.io/gitzlaffc4/33rpm:<tag> --owner gitzlaffc4`.
Security issues: see [SECURITY.md](SECURITY.md).
