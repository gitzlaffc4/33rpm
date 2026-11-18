/**
 * Conventional Commits 1.0 — enforced in CI over each PR's commits (not via git
 * hooks: `.npmrc` sets ignore-scripts, which blocks hook installers).
 * See CONTRIBUTING.md.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "perf",
        "refactor",
        "docs",
        "test",
        "build",
        "ci",
        "chore",
        "deps",
        "revert",
        "style",
      ],
    ],
    // Scopes are optional; unknown ones only warn.
    "scope-enum": [
      1,
      "always",
      [
        "db",
        "auth",
        "ui",
        "docker",
        "ci",
        "deps",
        "providers",
        "api",
        "build",
        "cli",
        "e2e",
        "release",
        "roadmap",
        "main",
      ],
    ],
    // Subjects may start with proper nouns (Next.js, SQLite, README, Playwright): warn only.
    "subject-case": [1, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    // Dependabot and release-please bodies contain long URLs and tables.
    "body-max-line-length": [1, "always", 100],
    "footer-max-line-length": [1, "always", 100],
  },
};
