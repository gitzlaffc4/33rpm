"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { userSettings } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { CURRENCY_CODES } from "@/lib/currencies";
import { encryptSecret } from "@/lib/secrets";
import { requireUser } from "@/lib/session";
import { getUserSettings } from "@/lib/user-settings";

export type ActionState = { ok?: string; error?: string };

function update(userId: string, values: Partial<typeof userSettings.$inferInsert>) {
  getUserSettings(userId); // ensure the row exists
  getDb()
    .update(userSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(userSettings.userId, userId))
    .run();
}

const DiscogsToken = z
  .string()
  .trim()
  .min(20, "That doesn't look like a Discogs personal access token")
  .max(200)
  .regex(/^[A-Za-z0-9]+$/, "Tokens contain only letters and digits");

export async function saveDiscogsToken(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = DiscogsToken.safeParse(formData.get("token"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  update(user.id, {
    discogsTokenEncrypted: encryptSecret(parsed.data),
    discogsTokenHint: parsed.data.slice(-4),
  });
  refresh();
  return { ok: "Discogs token saved." };
}

export async function removeDiscogsToken(): Promise<ActionState> {
  const user = await requireUser();
  update(user.id, { discogsTokenEncrypted: null, discogsTokenHint: null });
  refresh();
  return { ok: "Discogs token removed." };
}

const Preferences = z.object({
  defaultCurrency: z.enum(CURRENCY_CODES),
  theme: z.enum(["dark", "light", "system"]),
});

export async function savePreferences(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = Preferences.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid preferences" };
  update(user.id, parsed.data);
  refresh();
  return { ok: "Preferences saved." };
}

const Profile = z.object({ name: z.string().trim().min(1, "Name is required").max(100) });

export async function saveProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = Profile.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await getAuth().api.updateUser({ body: { name: parsed.data.name }, headers: await headers() });
  refresh();
  return { ok: "Profile saved." };
}
