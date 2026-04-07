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
export type ChatDensity = "comfortable" | "compact";
export type MotionPreference = "system" | "smooth" | "reduced";
export type MessageTextSize = "sm" | "md" | "lg";
export type BubbleStyle = "modern" | "classic";
export type RememberMode = "device" | "profile";

interface AppearanceSnapshot {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  sidebarLayout: SidebarLayout;
  chatDensity: ChatDensity;
  motionPreference: MotionPreference;
  messageTextSize: MessageTextSize;
  bubbleStyle: BubbleStyle;
}

const PROFILE_STORAGE_PREFIX = "moji-appearance-profile:";

const DEFAULT_APPEARANCE: AppearanceSnapshot = {
  themeMode: "light",
  accentColor: "blue",
  sidebarLayout: "full",
  chatDensity: "comfortable",
  motionPreference: "system",
  messageTextSize: "md",
  bubbleStyle: "modern",
};

interface ThemeState {
  // Legacy (kept for backward compat)
  isDark: boolean;

  // New
  themeMode: ThemeMode;
  accentColor: AccentColor;
  sidebarLayout: SidebarLayout;
  chatDensity: ChatDensity;
  motionPreference: MotionPreference;
  messageTextSize: MessageTextSize;
  bubbleStyle: BubbleStyle;
  rememberMode: RememberMode;
  activeProfileUserId: string | null;

  // Actions
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setSidebarLayout: (layout: SidebarLayout) => void;
  setChatDensity: (density: ChatDensity) => void;
  setMotionPreference: (preference: MotionPreference) => void;
  setMessageTextSize: (size: MessageTextSize) => void;
  setBubbleStyle: (style: BubbleStyle) => void;
  setRememberMode: (mode: RememberMode) => void;
  bindProfileUser: (userId?: string | null) => void;
  resetAppearance: () => void;

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

const getSystemReducedMotion = () =>
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

const getProfileStorageKey = (userId: string) =>
  `${PROFILE_STORAGE_PREFIX}${userId}`;

const toAppearanceSnapshot = (state: ThemeState): AppearanceSnapshot => ({
  themeMode: state.themeMode,
  accentColor: state.accentColor,
  sidebarLayout: state.sidebarLayout,
  chatDensity: state.chatDensity,
  motionPreference: state.motionPreference,
  messageTextSize: state.messageTextSize,
  bubbleStyle: state.bubbleStyle,
});

const saveProfileAppearance = (userId: string, snapshot: AppearanceSnapshot) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getProfileStorageKey(userId), JSON.stringify(snapshot));
};

const loadProfileAppearance = (userId: string): AppearanceSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getProfileStorageKey(userId));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppearanceSnapshot>;
    return {
      themeMode: parsed.themeMode ?? DEFAULT_APPEARANCE.themeMode,
      accentColor: parsed.accentColor ?? DEFAULT_APPEARANCE.accentColor,
      sidebarLayout: parsed.sidebarLayout ?? DEFAULT_APPEARANCE.sidebarLayout,
      chatDensity: parsed.chatDensity ?? DEFAULT_APPEARANCE.chatDensity,
      motionPreference:
        parsed.motionPreference ?? DEFAULT_APPEARANCE.motionPreference,
      messageTextSize: parsed.messageTextSize ?? DEFAULT_APPEARANCE.messageTextSize,
      bubbleStyle: parsed.bubbleStyle ?? DEFAULT_APPEARANCE.bubbleStyle,
    };
  } catch {
    return null;
  }
};

/** Apply theme classes & data-accent to <html> */
const applyToDOM = (
  mode: ThemeMode,
  accent: AccentColor,
  density: ChatDensity,
  motion: MotionPreference,
  messageSize: MessageTextSize,
  bubbleStyle: BubbleStyle,
) => {
  const root = document.documentElement;
  const dark =
    mode === "dark" ? true : mode === "light" ? false : getSystemDark();
  const reducedMotion =
    motion === "reduced"
      ? true
      : motion === "smooth"
      ? false
      : getSystemReducedMotion();

  root.classList.toggle("dark", dark);
  root.setAttribute("data-accent", accent);
  root.setAttribute("data-chat-density", density);
  root.setAttribute("data-message-size", messageSize);
  root.setAttribute("data-bubble-style", bubbleStyle);
  root.setAttribute("data-motion", reducedMotion ? "reduced" : "smooth");
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => {
      const syncProfileSnapshot = () => {
        const state = get();
        if (state.rememberMode !== "profile" || !state.activeProfileUserId) {
          return;
        }

        saveProfileAppearance(
          state.activeProfileUserId,
          toAppearanceSnapshot(state),
        );
      };

      return {
      isDark: false,
      themeMode: DEFAULT_APPEARANCE.themeMode,
      accentColor: DEFAULT_APPEARANCE.accentColor,
      sidebarLayout: DEFAULT_APPEARANCE.sidebarLayout,
      chatDensity: DEFAULT_APPEARANCE.chatDensity,
      motionPreference: DEFAULT_APPEARANCE.motionPreference,
      messageTextSize: DEFAULT_APPEARANCE.messageTextSize,
      bubbleStyle: DEFAULT_APPEARANCE.bubbleStyle,
      rememberMode: "device",
      activeProfileUserId: null,

      applyTheme: () => {
        const {
          themeMode,
          accentColor,
          chatDensity,
          motionPreference,
          messageTextSize,
          bubbleStyle,
        } = get();
        applyToDOM(
          themeMode,
          accentColor,
          chatDensity,
          motionPreference,
          messageTextSize,
          bubbleStyle,
        );
      },

      setThemeMode: (mode) => {
        set({ themeMode: mode, isDark: mode === "dark" || (mode === "system" && getSystemDark()) });
        const { accentColor, chatDensity, motionPreference, messageTextSize, bubbleStyle } = get();
        applyToDOM(mode, accentColor, chatDensity, motionPreference, messageTextSize, bubbleStyle);
        syncProfileSnapshot();
      },

      setAccentColor: (color) => {
        set({ accentColor: color });
        const { themeMode, chatDensity, motionPreference, messageTextSize, bubbleStyle } = get();
        applyToDOM(themeMode, color, chatDensity, motionPreference, messageTextSize, bubbleStyle);
        syncProfileSnapshot();
      },

      setSidebarLayout: (layout) => {
        set({ sidebarLayout: layout });
        syncProfileSnapshot();
      },

      setChatDensity: (density) => {
        set({ chatDensity: density });
        const { themeMode, accentColor, motionPreference, messageTextSize, bubbleStyle } = get();
        applyToDOM(themeMode, accentColor, density, motionPreference, messageTextSize, bubbleStyle);
        syncProfileSnapshot();
      },

      setMotionPreference: (preference) => {
        set({ motionPreference: preference });
        const { themeMode, accentColor, chatDensity, messageTextSize, bubbleStyle } = get();
        applyToDOM(themeMode, accentColor, chatDensity, preference, messageTextSize, bubbleStyle);
        syncProfileSnapshot();
      },

      setMessageTextSize: (size) => {
        set({ messageTextSize: size });
        const { themeMode, accentColor, chatDensity, motionPreference, bubbleStyle } = get();
        applyToDOM(themeMode, accentColor, chatDensity, motionPreference, size, bubbleStyle);
        syncProfileSnapshot();
      },

      setBubbleStyle: (style) => {
        set({ bubbleStyle: style });
        const { themeMode, accentColor, chatDensity, motionPreference, messageTextSize } = get();
        applyToDOM(themeMode, accentColor, chatDensity, motionPreference, messageTextSize, style);
        syncProfileSnapshot();
      },

      setRememberMode: (mode) => {
        set({ rememberMode: mode });

        if (mode === "profile") {
          syncProfileSnapshot();
        }
      },

      bindProfileUser: (userId) => {
        const normalizedUserId = userId ?? null;
        set({ activeProfileUserId: normalizedUserId });

        const state = get();
        if (!normalizedUserId || state.rememberMode !== "profile") {
          return;
        }

        const profileAppearance = loadProfileAppearance(normalizedUserId);
        if (!profileAppearance) {
          saveProfileAppearance(normalizedUserId, toAppearanceSnapshot(state));
          return;
        }

        set({
          ...profileAppearance,
          isDark:
            profileAppearance.themeMode === "dark" ||
            (profileAppearance.themeMode === "system" && getSystemDark()),
        });
        applyToDOM(
          profileAppearance.themeMode,
          profileAppearance.accentColor,
          profileAppearance.chatDensity,
          profileAppearance.motionPreference,
          profileAppearance.messageTextSize,
          profileAppearance.bubbleStyle,
        );
      },

      resetAppearance: () => {
        set({
          ...DEFAULT_APPEARANCE,
          isDark:
            DEFAULT_APPEARANCE.themeMode === "dark" ||
            (DEFAULT_APPEARANCE.themeMode === "system" && getSystemDark()),
        });
        applyToDOM(
          DEFAULT_APPEARANCE.themeMode,
          DEFAULT_APPEARANCE.accentColor,
          DEFAULT_APPEARANCE.chatDensity,
          DEFAULT_APPEARANCE.motionPreference,
          DEFAULT_APPEARANCE.messageTextSize,
          DEFAULT_APPEARANCE.bubbleStyle,
        );
        syncProfileSnapshot();
      },

      // Legacy
      toggleTheme: () => {
        const next = get().themeMode === "dark" ? "light" : "dark";
        get().setThemeMode(next);
      },

      setTheme: (dark: boolean) => {
        get().setThemeMode(dark ? "dark" : "light");
      },
    };
    },
    {
      name: "moji-appearance",
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Re-apply stored settings after hydration
          applyToDOM(
            state.themeMode,
            state.accentColor,
            state.chatDensity ?? "comfortable",
            state.motionPreference ?? "system",
            state.messageTextSize ?? "md",
            state.bubbleStyle ?? "modern",
          );
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
        const { chatDensity, motionPreference, messageTextSize, bubbleStyle } = useThemeStore.getState();
        applyToDOM("system", accentColor, chatDensity, motionPreference, messageTextSize, bubbleStyle);
      }
    });

  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", () => {
      const {
        themeMode,
        accentColor,
        chatDensity,
        motionPreference,
        messageTextSize,
        bubbleStyle,
      } = useThemeStore.getState();
      if (motionPreference === "system") {
        applyToDOM(
          themeMode,
          accentColor,
          chatDensity,
          "system",
          messageTextSize,
          bubbleStyle,
        );
      }
    });
}
