import { useAuthStore } from "@/stores/useAuthStore";
import axios from "axios";

// Proxy configuration (avoid hardcoding localhost URLs here).
const api = axios.create({
  baseURL: import.meta.env.VITE_NODE_API || "/api/node",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor: reroute requests to Drupal when needed.
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  // Keep all auth routes on Node.js for now.

  // Attach access token for Node.js chat routes.
  if (accessToken) {
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
