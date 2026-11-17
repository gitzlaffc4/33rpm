"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeSetup, type SetupState } from "./actions";

function Field({
  id,
  label,
  errors,
  hint,
  ...props
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  errors?: string[];
  hint?: string;
}) {
  const describedBy = errors?.length ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={!!errors?.length}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && !errors?.length && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {errors?.map((e) => (
        <p key={e} id={`${id}-error`} className="text-xs text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(completeSetup, {});
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Field
        id="setupCode"
        label="Setup code"
        autoComplete="one-time-code"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        className="font-mono tracking-wider"
        hint="Printed in the server logs on startup (docker logs 33rpm)."
        errors={fe.setupCode}
        required
      />
      <Field id="name" label="Name" autoComplete="name" errors={fe.name} required />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        errors={fe.email}
        required
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        errors={fe.password}
        required
      />
      <Field
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        errors={fe.confirmPassword}
        required
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create admin account"}
      </Button>
    </form>
  );
}
