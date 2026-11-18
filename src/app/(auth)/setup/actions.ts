"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { createUserWithPassword } from "@/db/repos/users";
import { withTransaction } from "@/db/tx";
import { getEnv } from "@/env";
import { getAuth } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email";
import {
  consumeSetupCode,
  formatSetupBanner,
  issueSetupCodeIfNeeded,
  needsSetup,
} from "@/lib/setup-code";

import path from "node:path";

import { CopyError } from "@/db/copy";
import { importLibrary } from "@/db/copy/library-import";
import {
  clearLibraryOffer,
  getLibraryOffer,
  isImporting,
  setImporting,
} from "@/server/library-offer";

export type SetupState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

const SetupInput = z
  .object({
    setupCode: z.string().trim().min(1, "Enter the setup code from the server logs"),
    name: z.string().trim().min(1, "Required").max(100),
    // Normalize first (Zod 4 runs .trim() after the format check, and autofill can add
    // non-breaking or zero-width spaces), then validate.
    email: z.string().transform(normalizeEmail).pipe(z.email("Enter a valid email")),
    password: z.string().min(10, "At least 10 characters").max(256),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export async function completeSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const parsed = SetupInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;

  if (!(await needsSetup())) redirect("/login");
  if (isImporting()) return { error: "A library import is running. Wait for it to finish." };

  if (!(await consumeSetupCode(input.setupCode))) {
    // Slow down guessing (the code has ~79 bits of entropy; this is belt and braces).
    await new Promise((r) => setTimeout(r, 1000));
    return { fieldErrors: { setupCode: ["Invalid setup code"] } };
  }

  try {
    // Hash first: never await slow work inside a transaction.
    const passwordHash = await (await getAuth().$context).password.hash(input.password);
    // User + password account + settings land together or not at all. (Better Auth's
    // internal createUser requires a request-endpoint context in 1.7, so we insert directly.)
    await withTransaction(async (tx) => {
      await createUserWithPassword(tx, getDb().t, {
        name: input.name,
        email: input.email,
        passwordHash,
        // The setup code proves control of the server; treat the admin's email as verified
        // so a matching, IdP-verified OIDC identity can be linked automatically.
        emailVerified: true,
      });
    });
  } catch (e) {
    console.error("[33rpm] Admin creation failed:", e);
    // The code was consumed; issue a fresh one so setup can be retried.
    const code = await issueSetupCodeIfNeeded();
    if (code) console.log(formatSetupBanner(code, getEnv().APP_URL));
    return { error: "Could not create the account. Check the server logs for a new setup code." };
  }

  if (!getEnv().AUTH_LOCAL_LOGIN) redirect("/login?setup=done");

  await getAuth().api.signInEmail({
    body: { email: input.email, password: input.password },
    headers: await headers(),
  });
  redirect("/library");
}

export type ImportState = { error?: string };

/**
 * "Import existing library": copy the library found at startup into this (empty)
 * database. Protected by the setup code; nothing else can write while it runs (there are
 * no users yet, and setup is blocked).
 */
export async function importExistingLibrary(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const offer = getLibraryOffer();
  if (!offer || !(await needsSetup())) redirect("/login");
  if (isImporting()) return { error: "An import is already running." };
  const code = formData.get("setupCode");
  if (typeof code !== "string" || !(await consumeSetupCode(code.trim()))) {
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Invalid setup code" };
  }
  setImporting(true);
  try {
    const env = getEnv();
    const { result } = await importLibrary({
      sourceUrl: offer.source.url,
      target: getDb(),
      migrationsRoot: path.join(process.cwd(), "drizzle"),
      backupsDir: env.BACKUPS_DIR,
      renameSourceAfter: offer.isDefaultSqlite,
      log: (line) => console.log(`[33rpm] import: ${line}`),
    });
    clearLibraryOffer();
    console.log(`[33rpm] Library imported in ${result?.durationMs} ms. Log: ${result?.logFile}`);
  } catch (e) {
    console.error("[33rpm] Library import failed:", e);
    const fresh = await issueSetupCodeIfNeeded();
    if (fresh) console.log(formatSetupBanner(fresh, getEnv().APP_URL));
    return {
      error:
        e instanceof CopyError
          ? `${e.message} Nothing was changed. A new setup code is in the server logs.`
          : "The import failed and was rolled back. Check the server logs (a new setup code is there too).",
    };
  } finally {
    setImporting(false);
  }
  redirect("/login?imported=1");
}
