import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import axios from "axios"; // 1. Thêm dòng này

// 2. Thêm dòng này (QUAN TRỌNG NHẤT)
// Dòng này ép buộc React luôn gửi Cookie đi kèm mỗi khi gọi API
axios.defaults.withCredentials = true;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
