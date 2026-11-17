"use client";

import { useTheme } from "next-themes";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CURRENCIES } from "@/lib/currencies";
import { savePreferences, type ActionState } from "./actions";
import { FormStatus } from "./form-status";

export function PreferencesSection({
  defaultCurrency,
  theme,
}: {
  defaultCurrency: string;
  theme: "dark" | "light" | "system";
}) {
  const { setTheme } = useTheme();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const result = await savePreferences(prev, fd);
    if (!result.error) setTheme(String(fd.get("theme")));
    return result;
  }, {});

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="defaultCurrency">Default currency</Label>
          <NativeSelect id="defaultCurrency" name="defaultCurrency" defaultValue={defaultCurrency}>
            {CURRENCIES.map(([code, name]) => (
              <option key={code} value={code}>
                {code} — {name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="theme">Theme</Label>
          <NativeSelect id="theme" name="theme" defaultValue={theme}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match system</option>
          </NativeSelect>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          Save preferences
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
