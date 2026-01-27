import { useAuthStore } from "@/stores/useAuthStore";
import axios from "axios";

// Cấu hình Proxy (Đừng điền cứng http://localhost:5001 ở đây!)
const api = axios.create({
  baseURL: import.meta.env.VITE_NODE_API || "/api/node",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor: Tự động chuyển hướng sang Drupal nếu cần
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  // Các API này phải gọi sang Drupal (Cổng 8000)
  const drupalRoutes = ["/auth", "/users", "/friends"];

  // Kiểm tra URL
  if (config.url && drupalRoutes.some((route) => config.url?.includes(route))) {
    config.baseURL = import.meta.env.VITE_DRUPAL_API || "/api/drupal";
  }

  // Gắn Token (Cho Node.js chat)
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Xử lý Refresh Token (Giữ nguyên logic của bạn nhưng sửa URL refresh)
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest || originalRequest.url.includes("/auth/")) {
      return Promise.reject(error);
    }

    if (
      (error.response?.status === 401 || error.response?.status === 403) &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      try {
        // Drupal refresh bằng Cookie, không cần gửi body
        const res = await api.post("/auth/refresh");
        const newAccessToken = res.data.accessToken;

        useAuthStore.getState().setAccessToken(newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().clearState();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
