"use client";

import { useSuccessToast } from "@/components/toaster";
import { Camera } from "lucide-react";
import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/catalog/actions";
import { FormMessage } from "./form-message";

/** Pick a photo (camera on phones) and upload it immediately. */
export function PhotoUpload({
  action,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useSuccessToast(state);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form ref={form} action={formAction} className="flex flex-wrap items-center gap-3">
      <input
        ref={input}
        id="photo"
        name="photo"
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={() => form.current?.requestSubmit()}
        aria-label="Add a photo"
      />
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        <Camera aria-hidden /> {pending ? "Uploading…" : "Add photo"}
      </Button>
      <FormMessage state={state} />
    </form>
  );
}
