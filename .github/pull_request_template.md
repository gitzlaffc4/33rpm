<!--
PR title = the squash commit on main, so it must be a Conventional Commit:
  <type>(<optional scope>): <summary>      e.g.  feat(db): add PostgreSQL dialect
Breaking change: add `!` after the type/scope and a `BREAKING CHANGE: …` paragraph below.
-->

## Summary

<!-- What does this change and why? Link issues with "Closes #123". -->

## Roadmap phase

<!-- e.g. Phase 0.5 — Dual database support, or "n/a". -->

## Test notes

<!-- How you verified it: commands run, manual steps, devices/browsers, DB backends. -->

## Screenshots

<!-- UI changes: before/after, mobile and desktop. Delete if not applicable. -->

## Checklist

- [ ] PR title follows Conventional Commits
- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass locally
- [ ] Tests added or updated for the change
- [ ] Schema changes touch both SQLite and PostgreSQL trees and migrations (if any)
- [ ] New env vars documented in `.env.example` and the README (if any)
- [ ] `ROADMAP.md` ticked / updated (if this completes or discovers roadmap items)
- [ ] No secrets, personal hostnames/IPs, or real collection data committed
