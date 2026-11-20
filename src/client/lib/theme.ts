import { useState } from "react";

/* Light/dark choice stored on this device. Light is the default, whatever the phone's setting. */

const KEY = "scl-theme";
export type LocalTheme = "light" | "dark";

export function storedTheme(): LocalTheme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: LocalTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable (private mode) – theme still applies for this page */
  }
}

export function useLocalTheme(): [LocalTheme, (t: LocalTheme) => void] {
  const [theme, setTheme] = useState(storedTheme);
  return [
    theme,
    (t) => {
      setTheme(t);
      applyTheme(t);
    },
  ];
}
