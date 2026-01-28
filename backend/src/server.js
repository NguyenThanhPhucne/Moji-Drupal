import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./libs/db.js";
import { initDrupalSync, closeDrupalSync } from "./libs/drupalSync.js";
import authRoute from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import friendRoute from "./routes/friendRoute.js";
import messageRoute from "./routes/messageRoute.js";
import conversationRoute from "./routes/conversationRoute.js";
import { getAdminConversations } from "./controllers/conversationController.js";
import cookieParser from "cookie-parser";
import { protectedRoute } from "./middlewares/authMiddleware.js";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import { app, server } from "./socket/index.js";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

// const app = express();
const PORT = process.env.PORT || 5001;

// middlewares
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// CLOUDINARY Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// swagger
const swaggerDocument = JSON.parse(
  fs.readFileSync("./src/swagger.json", "utf8"),
);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// public routes (no auth required)
app.use("/api/auth", authRoute);

// admin routes (no auth required - Drupal has its own auth)
// ⚠️ MUST be BEFORE protectedRoute middleware
app.get("/api/conversations/admin/conversations", getAdminConversations);

// private routes (auth required)
app.use(protectedRoute);
app.use("/api/users", userRoute);
app.use("/api/friends", friendRoute);
app.use("/api/messages", messageRoute);
// ⚠️ Conversation routes after protectedRoute - but admin route already handled above
app.use("/api/conversations", conversationRoute);

connectDB().then(() => {
  // Initialize Drupal sync
  initDrupalSync();

  // THÊM "0.0.0.0" VÀO ĐÂY
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`server bắt đầu trên cổng ${PORT}`);
    console.log(`✅ Real-time Drupal sync enabled`);
  });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  await closeDrupalSync();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down gracefully...");
  await closeDrupalSync();
  process.exit(0);
});
