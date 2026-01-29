import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import axios from "axios"; // 1. Thêm dòng này

// 2. Thêm dòng này (QUAN TRỌNG NHẤT)
// Dòng này ép buộc React luôn gửi Cookie đi kèm mỗi khi gọi API
axios.defaults.withCredentials = true;

// 3. Khôi phục theme preference từ localStorage trước khi render
// Điều này tránh hiện tượng flash (chớp nháy) khi trang load
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
    // Nếu có lỗi parsing, bỏ qua
    console.error("Failed to restore theme:", e);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
