"use client";

import { useSuccessToast } from "@/components/toaster";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { priceInputValue } from "@/lib/catalog/format";
import type { WishState } from "@/lib/catalog/wishlist-actions";
import { CURRENCIES } from "@/lib/currencies";

export function WishForm({
  action,
  initial,
  defaultCurrency,
}: {
  action: (prev: WishState, fd: FormData) => Promise<WishState>;
  initial: {
    priority: number;
    maxPriceMinor: number | null;
    currency: string | null;
    notes: string | null;
    status: string;
    tags: string[];
  };
  defaultCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useSuccessToast(state);
  const currency = initial.currency ?? defaultCurrency;
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <NativeSelect id="priority" name="priority" defaultValue={String(initial.priority)}>
            <option value="1">High</option>
            <option value="2">Medium</option>
            <option value="3">Low</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={initial.status}>
            <option value="wanted">Wanted</option>
            <option value="ordered">Ordered</option>
            <option value="acquired">Acquired</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <div className="space-y-2">
          <Label htmlFor="maxPrice">Max price</Label>
          <Input
            id="maxPrice"
            name="maxPrice"
            inputMode="decimal"
            placeholder="No limit"
            defaultValue={priceInputValue(initial.maxPriceMinor, currency)}
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
      </div>
      <div className="space-y-2">
        <Label htmlFor="tags">Tags</Label>
        <Input
          id="tags"
          name="tags"
          placeholder="Comma separated"
          defaultValue={initial.tags.join(", ")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={3} defaultValue={initial.notes ?? ""} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-destructive">
          {state.error ?? ""}
        </p>
      </div>
    </form>
  );
}
