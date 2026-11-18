"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/lib/catalog/actions";
import { CONDITION_LABEL, priceInputValue } from "@/lib/catalog/format";
import { CURRENCIES } from "@/lib/currencies";
import { FormMessage } from "./form-message";

export type CopyFormValues = {
  mediaCondition: string | null;
  sleeveCondition: string | null;
  priceMinor: number | null;
  currency: string | null;
  acquiredOn: string | null;
  source: string | null;
  locationId: string | null;
  notes: string | null;
  rating: number | null;
  tags: string[];
};

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  locations: { id: string; name: string }[];
  defaultCurrency: string;
  initial?: Partial<CopyFormValues>;
  submitLabel: string;
  /** Render extra fields (manual entry) inside the same <form>. */
  children?: React.ReactNode;
};

const NEW = "__new__";

function ConditionSelect({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} name={name} defaultValue={value ?? ""}>
        <option value="">Not graded</option>
        {Object.entries(CONDITION_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Condition, price, date, source, location, notes, rating and tags for one copy. */
export function CopyForm({
  action,
  locations,
  defaultCurrency,
  initial = {},
  submitLabel,
  children,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [location, setLocation] = useState(initial.locationId ?? "");
  const currency = initial.currency ?? defaultCurrency;

  return (
    <form action={formAction} className="space-y-6" aria-describedby="copy-form-status">
      {children}
      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">
          Condition (Goldmine)
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConditionSelect
            id="mediaCondition"
            name="mediaCondition"
            label="Media"
            value={initial.mediaCondition}
          />
          <ConditionSelect
            id="sleeveCondition"
            name="sleeveCondition"
            label="Sleeve / case"
            value={initial.sleeveCondition}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">Purchase</legend>
        <div className="grid grid-cols-[1fr_7rem] gap-4 sm:grid-cols-[1fr_8rem_1fr]">
          <div className="space-y-2">
            <Label htmlFor="price">Price</Label>
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={priceInputValue(initial.priceMinor ?? null, currency)}
              aria-invalid={state.field === "price" || undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <NativeSelect id="currency" name="currency" defaultValue={currency}>
              {CURRENCIES.map(([code]) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <Label htmlFor="acquiredOn">Date acquired</Label>
            <Input
              id="acquiredOn"
              name="acquiredOn"
              type="date"
              defaultValue={initial.acquiredOn ?? ""}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Where from</Label>
          <Input
            id="source"
            name="source"
            placeholder="Record store, Discogs seller, gift…"
            defaultValue={initial.source ?? ""}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-medium text-muted-foreground">On the shelf</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="locationId">Location</Label>
            <NativeSelect
              id="locationId"
              name="locationId"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={NEW}>New location…</option>
            </NativeSelect>
          </div>
          {location === NEW && (
            <div className="space-y-2">
              <Label htmlFor="newLocation">New location name</Label>
              <Input
                id="newLocation"
                name="newLocation"
                placeholder="Shelf A, Crate 3…"
                required
                autoFocus
              />
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input
              id="tags"
              name="tags"
              placeholder="Comma separated"
              defaultValue={(initial.tags ?? []).join(", ")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rating">Rating</Label>
            <NativeSelect
              id="rating"
              name="rating"
              defaultValue={initial.rating ? String(initial.rating) : ""}
            >
              <option value="">No rating</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)}
                  {"☆".repeat(5 - n)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={initial.notes ?? ""} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <div id="copy-form-status">
          <FormMessage state={state} />
        </div>
      </div>
    </form>
  );
}
