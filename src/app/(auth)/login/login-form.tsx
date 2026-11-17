"use client";

import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export function LoginForm({
  localLogin,
  oidc,
  next,
  initialError,
  notice,
}: {
  localLogin: boolean;
  oidc: { providerId: string; name: string } | null;
  next: string;
  initialError: string | null;
  notice: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [pending, startTransition] = useTransition();

  function onPasswordLogin(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signIn.email({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      if (error) {
        setError(
          error.status === 429
            ? "Too many attempts. Wait a minute and try again."
            : "Incorrect email or password.",
        );
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  function onOidcLogin() {
    if (!oidc) return;
    setError(null);
    startTransition(async () => {
      const { error } = await authClient.signIn.social({
        provider: oidc.providerId,
        callbackURL: next,
        errorCallbackURL: "/login",
      });
      if (error) setError(error.message ?? "Couldn't start SSO sign-in.");
    });
  }

  return (
    <div className="space-y-4">
      {notice && (
        <Alert variant="success">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {oidc && (
        <Button
          type="button"
          size="lg"
          className="w-full"
          variant={localLogin ? "outline" : "default"}
          onClick={onOidcLogin}
          disabled={pending}
        >
          <KeyRound />
          Sign in with {oidc.name}
        </Button>
      )}

      {oidc && localLogin && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>
      )}

      {localLogin && (
        <form action={onPasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      )}
    </div>
  );
}
