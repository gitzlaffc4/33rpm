"use client";

import { useActionState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DiscogsTokenStatus } from "@/lib/discogs-token";
import { removeDiscogsToken, saveDiscogsToken, type ActionState } from "./actions";
import { FormStatus } from "./form-status";

function describe(status: DiscogsTokenStatus) {
  switch (status.source) {
    case "settings":
      return `A token is saved (••••${status.hint ?? ""}).`;
    case "env":
      return "Using the DISCOGS_TOKEN from the server environment. Save one here to override it.";
    case "undecryptable":
      return "A token is saved but can't be decrypted (ENCRYPTION_KEY / AUTH_SECRET changed). Enter it again.";
    case "none":
      return "No token set. 33rpm will use MusicBrainz only.";
  }
}

export function DiscogsSection({ status }: { status: DiscogsTokenStatus }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveDiscogsToken, {});
  const [removing, startRemove] = useTransition();
  const hasSaved = status.source === "settings" || status.source === "undecryptable";

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">{describe(status)}</p>
      <div className="space-y-2">
        <Label htmlFor="token">Personal access token</Label>
        <Input
          id="token"
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasSaved ? "Enter a new token to replace it" : "Paste your token"}
          aria-describedby="token-hint"
        />
        <p id="token-hint" className="text-xs text-muted-foreground">
          Create one at discogs.com → Settings → Developers. It is stored encrypted and never shown
          again.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save token
        </Button>
        {hasSaved && (
          <Button
            type="button"
            variant="ghost"
            disabled={removing}
            onClick={() => startRemove(async () => void (await removeDiscogsToken()))}
          >
            Remove
          </Button>
        )}
        <FormStatus state={state} />
      </div>
    </form>
  );
}
