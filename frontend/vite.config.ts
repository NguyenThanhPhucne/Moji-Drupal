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
    // Let Vite handle chunk splitting automatically to avoid TDZ (Temporal Dead Zone)
    // errors caused by manual chunk ordering issues in Rollup.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Safe manual chunks — only split truly isolated leaf packages
        // (no cross-chunk circular deps possible here)
        manualChunks: {
          "react-core":  ["react", "react-dom", "react-router-dom"],
          "emoji-data":  ["@emoji-mart/data"],
          "emoji-react": ["emoji-mart", "@emoji-mart/react"],
          "date-utils":  ["date-fns"],
        },
      },
    },
  },
  // --- VITE DEV SERVER PROXY ---
  server: {
    proxy: {
      // Generic /api proxy for Node.js backend (port 5001)
      "/api": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        secure: false,
      },
      // Socket.IO proxy (websocket + polling)
      "/socket.io": {
        target: "http://127.0.0.1:5001",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
