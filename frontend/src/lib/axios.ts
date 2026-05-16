import { useAuthStore } from "@/stores/useAuthStore";
import axios from "axios";

const MISSING_API_BANNER_ID = "moji-missing-api-base-banner";

const reportMissingApiBase = () => {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(MISSING_API_BANNER_ID)) {
    return;
  }

  const addBanner = () => {
    if (document.getElementById(MISSING_API_BANNER_ID)) {
      return;
    }

    const banner = document.createElement("div");
    banner.id = MISSING_API_BANNER_ID;
    banner.setAttribute("role", "alert");
    banner.textContent =
      "Configuration error: API base URL is missing. Set VITE_NODE_API (for example, /api).";
    banner.style.cssText =
      "position:fixed;inset:auto 16px 16px 16px;z-index:99999;padding:12px 14px;" +
      "border-radius:10px;background:hsl(var(--foreground));color:hsl(var(--background));" +
      "border:1px solid hsl(var(--border));" +
      "font:500 13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
      "box-shadow:0 10px 30px -18px hsl(var(--foreground) / 0.45);";

    const container = document.body || document.documentElement;
    container.appendChild(banner);
  };

  if (document.body) {
    addBanner();
  } else {
    document.addEventListener("DOMContentLoaded", addBanner, { once: true });
  }

  console.error("[Config] Missing VITE_NODE_API.");
};

const normalizeApiBase = (rawBase: string | undefined) => {
  const value = String(rawBase || "").trim();
  if (!value) {
    return "/api";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
};

const rawApiBase = String(import.meta.env.VITE_NODE_API || "").trim();
if (!rawApiBase) {
  // Surface a user-facing notice when the API base URL is missing.
  reportMissingApiBase();
}

// Proxy configuration (avoid hardcoding localhost URLs here).
const api = axios.create({
  baseURL: normalizeApiBase(rawApiBase),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor: reroute requests to Drupal when needed.
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  const requestUrl = String(config.url || "");
  const isRefreshRequest = requestUrl.includes("/auth/refresh");
  const skipAuthHeader =
    String(config.headers?.["x-moji-skip-auth"] || "") === "1";

  if (skipAuthHeader) {
    delete config.headers["x-moji-skip-auth"];
  }

  // Keep all auth routes on Node.js for now.

  // Attach access token for Node.js chat routes.
  if (accessToken && !isRefreshRequest && !skipAuthHeader) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  // Let browser set multipart boundary for FormData payloads.
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  return config;
});

// Refresh token handling.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest || originalRequest.url.includes("/auth/")) {
      throw error;
    }

    if (
      (error.response?.status === 401 || error.response?.status === 403) &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        // Refresh with cookie session, no request body required.
        const res = await api.post("/auth/refresh");
        const newAccessToken = res.data.accessToken;

        useAuthStore.getState().setAccessToken(newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().clearState();
        throw refreshError;
      }
    }
    throw error;
  },
);

export default api;
