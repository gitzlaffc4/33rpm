import type { ActionState } from "./actions";

/** Inline, screen-reader-announced result of a settings form. */
export function FormStatus({ state }: { state: ActionState }) {
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
