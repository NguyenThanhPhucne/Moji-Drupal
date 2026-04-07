import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor =
  | "blue"
  | "violet"
  | "rose"
  | "emerald"
  | "amber"
  | "sunset"
  | "ocean"
  | "slate";
export type SidebarLayout = "full" | "compact";

interface ThemeState {
  // Legacy (kept for backward compat)
  isDark: boolean;

  // New
  themeMode: ThemeMode;
  accentColor: AccentColor;
  sidebarLayout: SidebarLayout;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setSidebarLayout: (layout: SidebarLayout) => void;

  // Legacy helpers
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
  applyTheme: () => void;
}

/** Resolve system preference */
const getSystemDark = () =>
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;

/** Apply theme classes & data-accent to <html> */
const applyToDOM = (mode: ThemeMode, accent: AccentColor) => {
  const root = document.documentElement;
  const dark =
    mode === "dark" ? true : mode === "light" ? false : getSystemDark();

  root.classList.toggle("dark", dark);
  root.setAttribute("data-accent", accent);
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,
      themeMode: "light",
      accentColor: "blue",
      sidebarLayout: "full",

      applyTheme: () => {
        const { themeMode, accentColor } = get();
        applyToDOM(themeMode, accentColor);
      },

      setThemeMode: (mode) => {
        set({ themeMode: mode, isDark: mode === "dark" || (mode === "system" && getSystemDark()) });
        applyToDOM(mode, get().accentColor);
      },

      setAccentColor: (color) => {
        set({ accentColor: color });
        applyToDOM(get().themeMode, color);
      },

      setSidebarLayout: (layout) => {
        set({ sidebarLayout: layout });
      },

      // Legacy
      toggleTheme: () => {
        const next = get().themeMode === "dark" ? "light" : "dark";
        get().setThemeMode(next);
      },

      setTheme: (dark: boolean) => {
        get().setThemeMode(dark ? "dark" : "light");
      },
    }),
    {
      name: "moji-appearance",
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Re-apply stored settings after hydration
          applyToDOM(state.themeMode, state.accentColor);
        }
      },
    }
  )
);

/** Listen to system dark mode changes when in "system" mode */
if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const { themeMode, accentColor } = useThemeStore.getState();
      if (themeMode === "system") {
        applyToDOM("system", accentColor);
      }
    });
}
