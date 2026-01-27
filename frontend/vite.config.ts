import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // --- THÊM PHẦN NÀY ĐỂ SỬA LỖI 401 ---
  server: {
    proxy: {
      // 1. Khi gọi /api/drupal -> Chuyển hướng ngầm sang cổng 8000
      "/api/drupal": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
        // Dòng này biến đổi: "/api/drupal/auth/..." thành "/api/auth/..." để khớp với Drupal
        rewrite: (path) => path.replace(/^\/api\/drupal/, "/api"),
      },
      // 2. Khi gọi /api/node -> Chuyển hướng ngầm sang cổng 5001
      "/api/node": {
        target: "http://localhost:5001",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/node/, "/api"),
      },
    },
  },
});
