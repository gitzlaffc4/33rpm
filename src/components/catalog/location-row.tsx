"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/catalog/actions";
import { ActionButton } from "./action-buttons";
import { FormMessage } from "./form-message";

export function AddLocationForm({
  action,
}: {
  action: (p: FormState, f: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label htmlFor="new-location" className="sr-only">
        New location
      </label>
      <Input
        id="new-location"
        name="name"
        placeholder="Shelf A, Crate 3, Living room…"
        className="max-w-xs"
        required
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        Add location
      </Button>
      <FormMessage state={state} />
    </form>
  );
}

export function RenameLocation({
  name,
  rename,
  remove,
}: {
  name: string;
  rename: (p: FormState, f: FormData) => Promise<FormState>;
  remove: () => Promise<FormState>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (p: FormState, f: FormData) => {
    const res = await rename(p, f);
    if (!res.error) setEditing(false);
    return res;
  }, {});
  if (!editing) {
    return (
      <span className="flex items-center gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Rename
        </Button>
        <ActionButton
          action={remove}
          label="Delete"
          icon="delete"
          confirm={`Delete “${name}”? Copies stored there keep their data but lose the location.`}
        />
      </span>
    );
  }
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input
        name="name"
        defaultValue={name}
        aria-label="Location name"
        className="h-8 w-40"
        autoFocus
        required
      />
      <Button type="submit" size="sm" disabled={pending}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancel
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
