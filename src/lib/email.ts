/**
 * Invisible characters autofill, password managers and copy/paste can add: every kind of
 * whitespace (including non-breaking spaces that `trim()` and browsers' email sanitizing
 * miss), zero-width spaces/joiners, BOM, soft hyphen, word joiners.
 */
const INVISIBLE = new RegExp(
  "[\\s\\u00A0\\u00AD\\u180E\\u200B-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u3000\\uFEFF]",
  "g",
);

/** Normalize a typed or autofilled email before validating it: NFKC, strip, lowercase. */
export function normalizeEmail(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .toLowerCase();
}
