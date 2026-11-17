/**
 * OIDC access policy, kept free of Better Auth types so it is easy to unit-test.
 *
 * - OIDC_ALLOWED_EMAILS (if non-empty) restricts which IdP identities may sign in,
 *   be created, or be linked. Entries may be full addresses or "@domain.tld".
 * - New-user creation via OIDC is governed separately by OIDC_AUTO_SIGNUP
 *   (Better Auth's `disableSignUp`).
 */
export function isEmailAllowed(email: string | null | undefined, allowList: string[]): boolean {
  if (allowList.length === 0) return true;
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return allowList.some((entry) => (entry.startsWith("@") ? e.endsWith(entry) : e === entry));
}
