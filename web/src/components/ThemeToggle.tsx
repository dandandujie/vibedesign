import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "vd-theme";
const CHANGE_EVENT = "vd-theme-change";

export function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  if (persist) localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: theme }));
}

export function initializeTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  applyTheme(stored === "dark" ? "dark" : "light", false);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const sync = (event: Event) => setTheme((event as CustomEvent<Theme>).detail ?? readTheme());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  const dark = theme === "dark";
  const label = dark ? "切换到明亮模式" : "切换到暗黑模式";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      aria-label={label}
      title={label}
      onClick={() => applyTheme(dark ? "light" : "dark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 2.1v1.45M10 16.45v1.45M2.1 10h1.45M16.45 10h1.45M4.42 4.42l1.03 1.03M14.55 14.55l1.03 1.03M15.58 4.42l-1.03 1.03M5.45 14.55l-1.03 1.03" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.8 12.65A6.35 6.35 0 0 1 7.35 4.2 6.35 6.35 0 1 0 15.8 12.65Z" />
    </svg>
  );
}
