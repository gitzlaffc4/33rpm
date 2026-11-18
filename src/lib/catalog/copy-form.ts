import { z } from "zod";

import { CONDITIONS } from "@/db/schema/sqlite/catalog";
import { CURRENCY_CODES } from "@/lib/currencies";
import { parsePrice } from "./format";

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

/** Shape of the copy form (add + edit). */
export const CopyFormSchema = z
  .object({
    mediaCondition: opt.pipe(z.enum(CONDITIONS).nullable()),
    sleeveCondition: opt.pipe(z.enum(CONDITIONS).nullable()),
    price: opt,
    currency: z.enum(CURRENCY_CODES),
    acquiredOn: opt.pipe(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date")
        .nullable(),
    ),
    source: opt.pipe(z.string().max(120).nullable()),
    locationId: opt,
    newLocation: opt.pipe(z.string().max(80).nullable()),
    notes: opt.pipe(z.string().max(4000).nullable()),
    rating: opt
      .transform((v) => (v === null ? null : Number(v)))
      .pipe(z.number().int().min(1).max(5).nullable()),
    tags: opt.transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  })
  .transform((v, ctx) => {
    const priceMinor = v.price === null ? null : parsePrice(v.price, v.currency);
    if (Number.isNaN(priceMinor)) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Enter a price like 24.99" });
      return z.NEVER;
    }
    return { ...v, priceMinor };
  });

export type CopyForm = z.output<typeof CopyFormSchema>;

export function parseCopyForm(formData: FormData) {
  const raw: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string") raw[k] = v;
  const parsed = CopyFormSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false as const,
      error: issue?.message ?? "Invalid input",
      field: String(issue?.path[0] ?? ""),
    };
  }
  return { ok: true as const, data: parsed.data };
}
