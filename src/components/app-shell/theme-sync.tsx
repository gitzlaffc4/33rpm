"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

/** Applies the theme saved in the user's settings (DB) on this device. */
export function ThemeSync({ theme }: { theme: "dark" | "light" | "system" }) {
  const { theme: current, setTheme } = useTheme();
  useEffect(() => {
    if (current !== theme) setTheme(theme);
    // Only react to the saved value changing, not local toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  return null;
}
