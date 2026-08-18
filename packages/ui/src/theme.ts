export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "openbot.theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Storage may be unavailable (private mode); fall through to system.
  }
  return "system";
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Non-persistent environments still get the in-session theme.
  }
  applyTheme(preference);
}

/**
 * Applies the stored theme and keeps it in sync with the OS while the
 * preference is "system". Returns an unsubscribe function.
 */
export function initTheme(): () => void {
  applyTheme(getThemePreference());
  const query = media();
  const onChange = () => {
    if (getThemePreference() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function applyTheme(preference: ThemePreference): void {
  const dark = preference === "dark" || (preference === "system" && media().matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
