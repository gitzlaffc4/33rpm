"use client";

import { useActionState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importExistingLibrary, type ImportState } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importExistingLibrary, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="import-code">Setup code</Label>
        <Input
          id="import-code"
          name="setupCode"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          required
          aria-describedby="import-code-hint"
        />
        <p id="import-code-hint" className="text-xs text-muted-foreground">
          Printed in the server logs at startup.
        </p>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Importing… (don't close this page)" : "Import library"}
      </Button>
    </form>
  );
}
