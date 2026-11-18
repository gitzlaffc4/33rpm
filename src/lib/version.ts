/**
 * Build information. `APP_VERSION` comes from package.json (the single source of
 * truth, maintained by release-please); `APP_COMMIT` is the git SHA the image was
 * built from. Both are inlined at build time by next.config.ts.
 */
export const APP_VERSION = process.env.APP_VERSION || "dev";
export const APP_COMMIT = process.env.APP_COMMIT || null;
export const APP_COMMIT_SHORT =
  APP_COMMIT && /^[0-9a-f]{7,40}$/i.test(APP_COMMIT) ? APP_COMMIT.slice(0, 7) : null;

export const REPO_URL = "https://github.com/gitzlaffc4/33rpm";
