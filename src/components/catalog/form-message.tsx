import type { FormState } from "@/lib/catalog/actions";

/** Inline error for a form (successes are shown as toasts). */
export function FormMessage({ state }: { state: FormState }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-destructive">
      {state.error ?? ""}
    </p>
  );
}
