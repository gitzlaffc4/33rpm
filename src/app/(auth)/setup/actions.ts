"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db";
import { account, user, userSettings } from "@/db/schema";
import { getEnv } from "@/env";
import { getAuth, LOCAL_PROVIDER_ID } from "@/lib/auth";
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

  const db = getDb();
  if (!needsSetup(db)) redirect("/login");

  if (!consumeSetupCode(db, input.setupCode)) {
    // Slow down guessing (the code has ~79 bits of entropy; this is belt and braces).
    await new Promise((r) => setTimeout(r, 1000));
    return { fieldErrors: { setupCode: ["Invalid setup code"] } };
  }

  try {
    const ctx = await getAuth().$context;
    const newId = (model: string) => ctx.generateId({ model }) || randomUUID();
    const passwordHash = await ctx.password.hash(input.password);
    const userId = newId("user");
    const now = new Date();

    // One synchronous SQLite transaction: user + password account + settings, or nothing.
    // (Better Auth's internal createUser requires a request-endpoint context in 1.7.)
    db.transaction((tx) => {
      tx.insert(user)
        .values({
          id: userId,
          name: input.name,
          email: input.email,
          // The setup code proves control of the server; treat the admin's email as verified
          // so a matching, IdP-verified OIDC identity can be linked automatically.
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(account)
        .values({
          id: newId("account"),
          userId,
          providerId: LOCAL_PROVIDER_ID,
          accountId: userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      tx.insert(userSettings).values({ userId }).run();
    });
  } catch (e) {
    console.error("[33rpm] Admin creation failed:", e);
    // The code was consumed; issue a fresh one so setup can be retried.
    const code = issueSetupCodeIfNeeded(db);
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
