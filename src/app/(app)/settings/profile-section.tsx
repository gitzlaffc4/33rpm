"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfile, type ActionState } from "./actions";
import { FormStatus } from "./form-status";

export function ProfileSection({
  name,
  email,
  methods,
}: {
  name: string;
  email: string;
  methods: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProfile, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" name="name" defaultValue={name} autoComplete="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Sign-in methods:</span>
        {methods.map((m) => (
          <Badge key={m} variant="secondary">
            {m}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          Save profile
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
