import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import axios from "axios";

// Always send cookies with every API request.
axios.defaults.withCredentials = true;

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
