"use client";

import { KeyRound, Link2, MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import type { ActionState } from "./actions";
import { FormStatus } from "./form-status";

export function ChangePasswordForm() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    if (newPassword.length < 10)
      return setState({ error: "New password must be at least 10 characters." });
    if (newPassword !== formData.get("confirmPassword"))
      return setState({ error: "New passwords don't match." });
    startTransition(async () => {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      setState(
        error
          ? { error: error.message ?? "Couldn't change password." }
          : { ok: "Password changed. Other sessions were signed out." },
      );
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <h3 className="flex items-center gap-2 font-medium">
        <KeyRound className="size-4" aria-hidden /> Change password
      </h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">New</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm new</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" variant="secondary" disabled={pending}>
          Change password
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function ConnectSso({
  providerId,
  providerName,
  linked,
  error,
}: {
  providerId: string;
  providerName: string;
  linked: boolean;
  error: string | null;
}) {
  const [state, setState] = useState<ActionState>(error ? { error } : {});
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 font-medium">
        <Link2 className="size-4" aria-hidden /> Single sign-on
      </h3>
      {linked ? (
        <p className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">{providerName}</Badge> connected. You can sign in with{" "}
          {providerName}.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Link your {providerName} identity to this account so you can sign in with SSO. Your
            identity provider must report a verified email.
          </p>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const { error } = await authClient.linkSocial({
                    provider: providerId,
                    callbackURL: "/settings?linked=1",
                    errorCallbackURL: "/settings",
                  });
                  if (error) setState({ error: error.message ?? "Couldn't start linking." });
                })
              }
            >
              Connect {providerName}
            </Button>
            <FormStatus state={state} />
          </div>
        </>
      )}
    </div>
  );
}

export function OtherSessions({ count }: { count: number }) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 font-medium">
        <MonitorSmartphone className="size-4" aria-hidden /> Sessions
      </h3>
      <p className="text-sm text-muted-foreground">
        {count === 0
          ? "You're only signed in on this device."
          : `You're signed in on ${count} other ${count === 1 ? "device or browser" : "devices or browsers"}.`}
      </p>
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          disabled={pending || count === 0}
          onClick={() =>
            startTransition(async () => {
              const { error } = await authClient.revokeOtherSessions();
              setState(
                error
                  ? { error: error.message ?? "Failed." }
                  : { ok: "Other sessions signed out." },
              );
              router.refresh();
            })
          }
        >
          Sign out all other sessions
        </Button>
        <FormStatus state={state} />
      </div>
    </div>
  );
}
