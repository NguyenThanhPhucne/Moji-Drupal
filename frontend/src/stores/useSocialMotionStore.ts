import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SocialMotionPreset = "premium-strict" | "responsive-strict";

interface SocialMotionState {
  preset: SocialMotionPreset;
  setPreset: (preset: SocialMotionPreset) => void;
  applyMotionPreset: () => void;
}

const DEFAULT_PRESET: SocialMotionPreset = "premium-strict";

let presetSwitchTimer: number | null = null;

const triggerPresetCrossFade = () => {
  if (typeof window === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.removeAttribute("data-social-motion-switch");

  // Force reflow so animation restarts when switching presets repeatedly.
  void root.offsetWidth;

  root.setAttribute("data-social-motion-switch", "in");

  if (presetSwitchTimer !== null) {
    window.clearTimeout(presetSwitchTimer);
  }

  presetSwitchTimer = window.setTimeout(() => {
    document.documentElement.removeAttribute("data-social-motion-switch");
    presetSwitchTimer = null;
  }, 120);
};

const applyPresetToDOM = (preset: SocialMotionPreset, withCrossFade = false) => {
  if (typeof window === "undefined") {
    return;
  }

  if (withCrossFade) {
    triggerPresetCrossFade();
  }

  document.documentElement.setAttribute("data-social-motion", preset);
};

export const useSocialMotionStore = create<SocialMotionState>()(
  persist(
    (set, get) => ({
      preset: DEFAULT_PRESET,
      setPreset: (preset) => {
        set({ preset });
        applyPresetToDOM(preset, true);
      },
      applyMotionPreset: () => {
        applyPresetToDOM(get().preset);
      },
    }),
    {
      name: "moji-social-motion",
      onRehydrateStorage: () => (state) => {
        applyPresetToDOM(state?.preset ?? DEFAULT_PRESET);
      },
    },
  ),
);
