"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useEffect } from "react";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "light" ? "light" : "dark"}
      position="bottom-center"
      // Above the phone tab bar.
      offset={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      mobileOffset={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      toastOptions={{ className: "!bg-popover !text-popover-foreground !border-border" }}
    />
  );
}

/** Toast a server action's success message (each new result, even if the text repeats). */
export function useSuccessToast(state: { ok?: string } | undefined) {
  useEffect(() => {
    if (state?.ok) toast.success(state.ok);
  }, [state]);
}
