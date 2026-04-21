import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import axios from "axios";

// Always send cookies with every API request.
axios.defaults.withCredentials = true;

const MOTION_LEVEL_STORAGE_KEY = "app-motion-level";
const PERSONALIZATION_STORAGE_KEY = "moji-personalization";

const restorePersonalizationSettings = () => {
  const savedPersonalization = localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
  if (!savedPersonalization) {
    return;
  }

  try {
    const personalizationData = JSON.parse(savedPersonalization);
    const locale = personalizationData?.state?.locale;
    const timestampStyle = personalizationData?.state?.timestampStylePreference;
    const notificationDensity =
      personalizationData?.state?.notificationDensityPreference;

    if (locale === "en" || locale === "vi") {
      document.documentElement.lang = locale;
    }

    document.documentElement.dir = "ltr";

    if (timestampStyle === "relative" || timestampStyle === "absolute") {
      document.documentElement.dataset.timestampStyle = timestampStyle;
    }

    if (notificationDensity === "comfortable" || notificationDensity === "compact") {
      document.documentElement.dataset.notificationDensity = notificationDensity;
    }
  } catch (error) {
    // Ignore invalid personalization payloads from old builds.
    console.error("Failed to restore personalization:", error);
  }
};

const resolveMotionLevel = () => {
  const urlParams = new URLSearchParams(globalThis.location.search);
  const queryMotionLevel = urlParams.get("motion");

  if (queryMotionLevel === "calm" || queryMotionLevel === "punchy") {
    localStorage.setItem(MOTION_LEVEL_STORAGE_KEY, queryMotionLevel);
    return queryMotionLevel;
  }

  const storedMotionLevel = localStorage.getItem(MOTION_LEVEL_STORAGE_KEY);
  return storedMotionLevel === "punchy" ? "punchy" : "calm";
};

const motionLevel = resolveMotionLevel();
document.documentElement.dataset.motionLevel = motionLevel;
restorePersonalizationSettings();

// Restore saved theme before initial render to avoid flash on page load.
const savedTheme = localStorage.getItem("theme-storage");
if (savedTheme) {
  try {
    const themeData = JSON.parse(savedTheme);
    if (themeData.state?.isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (e) {
    // Ignore invalid persisted theme payloads.
    console.error("Failed to restore theme:", e);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
