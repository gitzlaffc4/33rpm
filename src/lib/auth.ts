import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

import { getDb } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { getEnv } from "@/env";
import { isEmailAllowed } from "@/lib/oidc-policy";

/** Better Auth provider id for the configured OIDC IdP. Callback: /api/auth/callback/oidc */
export const OIDC_PROVIDER_ID = "oidc";
export const LOCAL_PROVIDER_ID = "credential";

function createAuth() {
  const env = getEnv();

  return betterAuth({
    appName: "33rpm",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    telemetry: { enabled: false },
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),

    emailAndPassword: {
      enabled: env.AUTH_LOCAL_LOGIN,
      // Accounts are never self-registered: the first admin is created on /setup.
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 256,
    },

    account: {
      accountLinking: {
        enabled: true,
        // No provider is "trusted": implicit (sign-in time) linking to an existing
        // account by email requires the IdP to assert email_verified=true.
        trustedProviders: [],
        // Explicit "Connect SSO" from Settings may link an IdP identity whose email
        // differs from the local one; the user is already authenticated there.
        allowDifferentEmails: true,
      },
    },

    user: {
      validateUserInfo: ({ user: info, source }) => {
        if (source.method !== "oauth") return;
        if (!isEmailAllowed(info.email, env.OIDC_ALLOWED_EMAILS)) {
          return {
            error: "email_not_allowed",
            errorDescription: "This account is not allowed to sign in to 33rpm.",
          };
        }
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh expiry at most daily
    },

    rateLimit: {
      enabled: env.NODE_ENV === "production",
      storage: "memory",
    },

    advanced: {
      useSecureCookies: env.SECURE_COOKIES,
      ipAddress: {
        ipAddressHeaders: env.IP_ADDRESS_HEADERS,
        ...(env.TRUSTED_PROXIES.length ? { trustedProxies: env.TRUSTED_PROXIES } : {}),
      },
    },

    onAPIError: { errorURL: "/login" },

    plugins: [
      ...(env.OIDC_ENABLED
        ? [
            genericOAuth({
              config: [
                {
                  providerId: OIDC_PROVIDER_ID,
                  name: env.OIDC_PROVIDER_NAME,
                  discoveryUrl: `${env.OIDC_ISSUER!.replace(/\/+$/, "")}/.well-known/openid-configuration`,
                  requireIdTokenVerification: true,
                  clientId: env.OIDC_CLIENT_ID!,
                  clientSecret: env.OIDC_CLIENT_SECRET!,
                  scopes: env.OIDC_SCOPES,
                  pkce: true,
                  disableSignUp: !env.OIDC_AUTO_SIGNUP,
                  disableProviderLogout: true,
                },
              ],
            }),
          ]
        : []),
      nextCookies(), // must be last
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __33rpmAuth?: Auth };

/** Lazily constructed so `next build` doesn't need runtime env or a database. */
export function getAuth(): Auth {
  globalForAuth.__33rpmAuth ??= createAuth();
  return globalForAuth.__33rpmAuth;
}
