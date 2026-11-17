/** Human-readable messages for Better Auth `?error=` codes shown on /login and /settings. */
const MESSAGES: Record<string, string> = {
  account_not_linked:
    "That SSO identity isn't linked to a 33rpm account. Sign in with your password and use “Connect SSO” in Settings, or ask your IdP to send a verified email.",
  signup_disabled:
    "No 33rpm account exists for that SSO identity, and automatic sign-up is disabled (OIDC_AUTO_SIGNUP).",
  email_not_allowed: "That account is not allowed to sign in to 33rpm (OIDC_ALLOWED_EMAILS).",
  unable_to_link_account:
    "Couldn't link the SSO identity. Your identity provider must report a verified email (email_verified).",
  account_already_linked_to_different_user:
    "That SSO identity is already linked to a different 33rpm account.",
  email_not_found: "Your identity provider didn't return an email address. Add the “email” scope.",
  email_not_verified: "Your identity provider reports this email as unverified.",
  invalid_code: "The sign-in attempt expired or was already used. Please try again.",
  state_mismatch: "The sign-in attempt expired or was already used. Please try again.",
  unable_to_get_user_info: "Couldn't read your profile from the identity provider.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? `Sign-in failed (${code.replace(/[^a-z0-9_]/gi, "")}).`;
}
