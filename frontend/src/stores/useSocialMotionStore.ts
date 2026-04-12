import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SocialMotionPreset = "premium-strict" | "responsive-strict";

interface SocialMotionState {
  preset: SocialMotionPreset;
  setPreset: (preset: SocialMotionPreset) => void;
  applyMotionPreset: () => void;
}

const DEFAULT_PRESET: SocialMotionPreset = "premium-strict";

let presetSwitchTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

const triggerPresetCrossFade = () => {
  if (!globalThis.window) {
    return;
  }

  const root = document.documentElement;
  delete root.dataset.socialMotionSwitch;

  // Force reflow so animation restarts when switching presets repeatedly.
  root.getBoundingClientRect();

  root.dataset.socialMotionSwitch = "in";

  if (presetSwitchTimer !== null) {
    globalThis.clearTimeout(presetSwitchTimer);
  }

  presetSwitchTimer = globalThis.setTimeout(() => {
    delete document.documentElement.dataset.socialMotionSwitch;
    presetSwitchTimer = null;
  }, 120);
};

const applyPresetToDOM = (preset: SocialMotionPreset, withCrossFade = false) => {
  if (!globalThis.window) {
    return;
  }

  if (withCrossFade) {
    triggerPresetCrossFade();
  }

  document.documentElement.dataset.socialMotion = preset;
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
