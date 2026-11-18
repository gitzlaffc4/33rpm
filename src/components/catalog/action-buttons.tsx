"use client";

import { useSuccessToast } from "@/components/toaster";
import { RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/catalog/actions";

/** A button that runs a bound server action, with an optional confirm and inline status. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  variant = "ghost",
  icon,
  className,
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  variant?: "ghost" | "outline" | "destructive" | "secondary";
  icon?: "refresh" | "delete";
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  useSuccessToast(state);
  const Icon = icon === "refresh" ? RefreshCw : icon === "delete" ? Trash2 : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={variant}
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setState((await action()) ?? {}));
        }}
      >
        {Icon && (
          <Icon
            aria-hidden
            className={pending && icon === "refresh" ? "animate-spin" : undefined}
          />
        )}
        {pending && pendingLabel ? pendingLabel : label}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-destructive">
        {state.error ?? ""}
      </span>
    </span>
  );
}
