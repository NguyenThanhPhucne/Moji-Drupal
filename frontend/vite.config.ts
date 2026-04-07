import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("react") ||
            id.includes("react-dom") ||
            id.includes("react-router")
          ) {
            return "react-core";
          }

          if (id.includes("@radix-ui") || id.includes("lucide-react")) {
            return "ui-kit";
          }

          if (
            id.includes("zustand") ||
            id.includes("socket.io-client") ||
            id.includes("axios")
          ) {
            return "state-network";
          }

          if (id.includes("@emoji-mart/data")) {
            return "emoji-data";
          }

          if (id.includes("@emoji-mart") || id.includes("emoji-mart")) {
            return "emoji-react";
          }

          if (id.includes("date-fns")) {
            return "date-utils";
          }
        },
      },
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
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/node/, "/api"),
      },
      // 3. Socket.IO proxy cho local dev (websocket + polling)
      "/socket.io": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
