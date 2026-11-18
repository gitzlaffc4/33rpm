import type { FormState } from "@/lib/catalog/actions";

export function FormMessage({ state }: { state: FormState }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={state.error ? "text-sm text-destructive" : "text-sm text-success"}
    >
      {state.error ?? state.ok ?? ""}
    </p>
  );
}
