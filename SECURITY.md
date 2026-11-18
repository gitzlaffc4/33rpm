# Security Policy

## Supported versions

33rpm is pre-1.0. Security fixes land on `main` and ship in the next release; only the
latest release is supported.

| Version                         | Supported      |
| ------------------------------- | -------------- |
| Latest release (`latest` image) | ✅             |
| `edge` (built from `main`)      | ✅ best effort |
| Older releases                  | ❌             |

## Reporting a vulnerability

**Please do not open a public issue.** Report privately via GitHub's
[private vulnerability reporting](https://github.com/gitzlaffc4/33rpm/security/advisories/new)
(Security → Advisories → Report a vulnerability).

Include what you found, how to reproduce it, the affected version (Settings → About or
`/api/health`), and the impact you expect. You'll get an acknowledgement within a week. Fixes are
coordinated in a private advisory and credited in the release notes unless you prefer otherwise.

## Scope

In scope: the 33rpm application, its Docker image, and the workflows in this repository.
Out of scope: vulnerabilities in your reverse proxy, identity provider, or host, and findings that
require an already-compromised admin account or server.

## How the project checks itself

Every PR runs CodeQL, dependency review (vulnerabilities and licenses), `npm audit` for production
dependencies, a Trivy scan of the built image, and gitleaks. Releases publish an SBOM and signed
build provenance, which you can verify with:

```bash
gh attestation verify oci://ghcr.io/gitzlaffc4/33rpm:<version> --owner gitzlaffc4
```
