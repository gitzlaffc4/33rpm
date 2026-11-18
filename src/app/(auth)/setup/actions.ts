"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { createUserWithPassword } from "@/db/repos/users";
import { withTransaction } from "@/db/tx";
import { getEnv } from "@/env";
import { getAuth } from "@/lib/auth";
import {
  consumeSetupCode,
  formatSetupBanner,
  issueSetupCodeIfNeeded,
  needsSetup,
} from "@/lib/setup-code";

export type SetupState = { error?: string; fieldErrors?: Record<string, string[] | undefined> };

const SetupInput = z
  .object({
    setupCode: z.string().trim().min(1, "Enter the setup code from the server logs"),
    name: z.string().trim().min(1, "Required").max(100),
    email: z.email("Enter a valid email").trim().toLowerCase(),
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
