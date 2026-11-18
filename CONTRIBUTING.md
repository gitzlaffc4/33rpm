# Contributing to 33rpm

Thanks for helping! This document covers how work flows through the repository: branches,
commits, pull requests, releases, and the automated checks. For what to build next, see
[ROADMAP.md](ROADMAP.md); for setup and scripts, see the README's **Development** section.

## Branches

Name branches `<type>/<short-kebab-description>`:

| Type       | Use for                                 | Example                       |
| ---------- | --------------------------------------- | ----------------------------- |
| `feat`     | New functionality                       | `feat/phase-0.5-dual-db`      |
| `fix`      | Bug fixes                               | `fix/login-redirect-loop`     |
| `chore`    | Maintenance that isn't a feature or fix | `chore/repo-conventions`      |
| `docs`     | Documentation only                      | `docs/reverse-proxy-examples` |
| `refactor` | Code changes that don't change behavior | `refactor/settings-repo`      |
| `test`     | Tests only                              | `test/e2e-mobile-nav`         |
| `ci`       | Workflows and automation                | `ci/trivy-cache`              |
| `deps`     | Dependency updates                      | `deps/next-16.5`              |
| `perf`     | Performance                             | `perf/library-grid-query`     |

Roadmap phases use `feat/phase-<n>-<slug>`. If a tool forces its own prefix (for example
Claude Code sessions use `claude/…`), keep it and append the conventional part:
`claude/feat-phase-0.5-dual-db`.

## Commits

Use [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<optional scope>): <summary in the imperative, no trailing period>

<optional body: what and why>

<optional footers>
```

- **Types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `deps`,
  `revert`, `style`.
- **Scopes** (optional, use where they help): `db`, `auth`, `ui`, `docker`, `ci`, `deps`,
  `providers`, `api`, `build`, `cli`, `e2e`, `release`, `roadmap`.
- **Breaking changes:** add `!` after the type/scope **and** a footer:

  ```
  feat(db)!: rename DATABASE_PATH to DATABASE_URL

  BREAKING CHANGE: DATABASE_PATH is no longer read. Set DATABASE_URL=file:/data/33rpm.db.
  ```

- Keep commits small and focused. Subjects may start with a proper noun (`Next.js`, `SQLite`).

Commit messages are checked in CI with [commitlint](commitlint.config.mjs) over every commit in a
PR. There are no git hooks (`.npmrc` sets `ignore-scripts=true`, which blocks hook installers);
to check locally before pushing:

```bash
npx commitlint --from origin/main --to HEAD
```

## Pull requests

- **Squash merge only.** The PR title becomes the single commit on `main`, so **the PR title must
  be a Conventional Commit** (checked by the _PR title_ workflow). The PR description becomes the
  commit body, so put `BREAKING CHANGE:` and `Release-As:` footers there.
- Fill in the PR template: summary, roadmap phase, test notes, screenshots for UI changes.
- All required checks must pass: lint, typecheck, unit tests, Playwright smoke test, Docker build,
  Trivy, CodeQL, dependency review, gitleaks, commitlint, and the PR title check.
- Code owners (see [`.github/CODEOWNERS`](.github/CODEOWNERS)) review every PR.

## Versioning and releases

`package.json` is the single source of truth for the version. It's shown in **Settings → About**,
returned by `/api/health`, and written to the image's OCI labels.

Releases are automated with [release-please](https://github.com/googleapis/release-please)
([config](release-please-config.json), [manifest](.release-please-manifest.json)):

1. Every push to `main` updates a **Release PR** (`chore(main): release X.Y.Z`) that bumps
   `package.json` and `package-lock.json` and updates [CHANGELOG.md](CHANGELOG.md) from the
   Conventional Commits since the last release.
2. Merging the Release PR tags `vX.Y.Z`, creates the GitHub release, and — in the same workflow
   run — builds, scans, attests and publishes the image.

**First release:** `0.1.0` (`initial-version` in the config; without it release-please defaults
a project's first release to `1.0.0`).

**Version bumps before 1.0:** `feat` → minor (`0.1.0` → `0.2.0`), `fix`/`perf`/`deps` → patch,
breaking changes → minor (`bump-minor-pre-major`). After 1.0, breaking changes bump the major.

**Pre-releases** (`vX.Y.Z-alpha.N`): put a `Release-As:` footer in the squash commit body (the PR
description), e.g.

```
Release-As: 0.3.0-alpha.1
```

release-please then proposes exactly that version; merging the Release PR publishes it, and the
workflow marks the GitHub release as a pre-release. Because release-please carries a pre-release
suffix forward on the next bump, **graduate explicitly** with `Release-As: 0.3.0` (or cut the
next alpha with `Release-As: 0.3.0-alpha.2`).

**Manual tags still work:** pushing a `vX.Y.Z` tag that matches `package.json` runs the
[Release image](.github/workflows/release.yml) workflow with the same build.

### Image tags (`ghcr.io/gitzlaffc4/33rpm`)

| Tag                   | Published for                         |
| --------------------- | ------------------------------------- |
| `X.Y.Z`               | every release, including pre-releases |
| `X.Y`, `X`, `latest`  | stable releases only                  |
| `edge`, `sha-<short>` | every push to `main`                  |

Every image is multi-arch (`linux/amd64`, `linux/arm64`, each built natively), ships an SBOM and
BuildKit provenance, and gets a GitHub build-provenance attestation:

```bash
gh attestation verify oci://ghcr.io/gitzlaffc4/33rpm:edge --owner gitzlaffc4
```

### Release PRs and required checks

release-please opens its PR with the workflow's `GITHUB_TOKEN`, and GitHub doesn't run workflows
for events created by that token. **The Release PR therefore shows no checks**, and the
maintainer merges it by bypassing the ruleset. That's acceptable because it only touches
`CHANGELOG.md`, `package.json`, `package-lock.json` and the manifest, all generated from commits
that already passed CI.

**Alternative (option b), if bypassing becomes a problem:** give release-please a token from a
GitHub App (e.g. via `actions/create-github-app-token`) with contents and pull-requests write.
Checks then run on the Release PR. Caveat: tags created with an App token _do_ trigger other
workflows, so the tag-triggered [Release image](.github/workflows/release.yml) workflow would also
fire. Either remove the build from `release-please.yml` (letting the tag workflow publish), or
skip `release.yml` for tags created by the App.

## Automated checks

| Check                  | When                                           | What fails it                                                |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Lint, typecheck, unit  | PRs, `main`                                    | Any error (also checks the CLI bundles)                      |
| Integration (sqlite)   | PRs, `main`                                    | Repo/migration/transaction tests fail on SQLite              |
| Integration (postgres) | PRs, `main`                                    | Same tests fail on PostgreSQL 17                             |
| Playwright smoke test  | PRs†, `main`†                                  | Any failure                                                  |
| `npm audit`            | PRs, `main`                                    | High/critical advisory in shippable production dependencies* |
| commitlint             | PRs                                            | Non-conventional commit                                      |
| PR title               | PRs                                            | Non-conventional title                                       |
| Docker build + Trivy   | PRs†; releases and `edge` (both architectures) | CRITICAL vulnerability with a fix available                  |
| CodeQL                 | PRs, `main`, weekly                            | New code-scanning alerts (configurable in settings)          |
| Dependency review      | PRs                                            | High+ vulnerability, or a license outside the allowlist      |
| gitleaks               | PRs                                            | Secrets in the diff                                          |
| OpenSSF Scorecard      | weekly, `main`                                 | Informational only                                           |

† Skipped when a PR only changes docs or repo metadata (`*.md`, `docs/`, issue/PR templates,
`CODEOWNERS`, `dependabot.yml`); a skipped job still satisfies the required check. The Playwright job
runs in the official Playwright container for the pinned `@playwright/test` version.

\* `npm audit --omit=dev --omit=optional --omit=peer`: optional and peer-only packages (e.g. test
tooling a library lists as an optional peer) never reach the standalone build; Trivy scans what the
image actually contains.

Dependabot opens grouped weekly PRs: npm minor/patch together, each npm major separately, GitHub
Actions (pinned to full commit SHAs), and the Docker base image digest.

**License allowlist** ([config](.github/dependency-review-config.yml)): MIT, ISC, BSD-2-Clause,
BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, CC0-1.0, Unlicense — compatible with both MIT and
AGPL-3.0. Named exceptions: `@img/sharp-*` libvips binaries (LGPL-3.0-or-later; optional Next.js
dependency), `lightningcss*` (MPL-2.0; Tailwind build), `caniuse-lite` (CC-BY-4.0) and `argparse`
(Python-2.0; dev only). Add new exceptions deliberately, by exact package name.

## Workflow hardening

- Every workflow sets `permissions: contents: read` at the top and grants more per job only where
  needed.
- Third-party actions are pinned to a full commit SHA with a `# vX.Y.Z` comment; Dependabot
  updates both.
- Concurrency groups cancel superseded runs.
- `actions/checkout` uses `persist-credentials: false` unless a job must push.

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities privately, never in public issues.
