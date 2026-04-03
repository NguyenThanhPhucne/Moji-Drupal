import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./libs/db.js";
import { initDrupalSync, closeDrupalSync } from "./libs/drupalSync.js";
import authRoute from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import friendRoute from "./routes/friendRoute.js";
import messageRoute from "./routes/messageRoute.js";
import conversationRoute from "./routes/conversationRoute.js";
import bookmarkRoute from "./routes/bookmarkRoute.js";
import searchRoute from "./routes/searchRoute.js";
import socialRoute from "./routes/socialRoute.js";
import {
  getAdminConversations,
  deleteConversation,
  getAdminConversation,
} from "./controllers/conversationController.js";
import cookieParser from "cookie-parser";
import { protectedRoute } from "./middlewares/authMiddleware.js";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import fs from "node:fs";
import { app, server } from "./socket/index.js";
import { v2 as cloudinary } from "cloudinary";

dotenv.config();

const PORT = process.env.PORT || 5001;

const getAllowedOrigins = () => {
  const originsFromList = String(process.env.CLIENT_URLS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const singleOrigin = String(process.env.CLIENT_URL || "").trim();
  if (singleOrigin) {
    originsFromList.push(singleOrigin);
  }

  return [...new Set(originsFromList)];
};

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

// middlewares
// Chat image messages are sent as base64 data URLs, which are larger than default 100kb.
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());
app.use(cors(corsOptions));

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

// private routes (auth required)
app.use(protectedRoute);

// admin routes (protected; RBAC enforced by controller)
app.get("/api/conversations/admin/conversations", getAdminConversations);
app.get("/api/conversations/admin/:conversationId", getAdminConversation);
app.delete("/api/conversations/admin/:conversationId", deleteConversation);

app.use("/api/users", userRoute);
app.use("/api/friends", friendRoute);
app.use("/api/messages", messageRoute);
app.use("/api/conversations", conversationRoute);
app.use("/api/bookmarks", bookmarkRoute);
app.use("/api/search", searchRoute);
app.use("/api/social", socialRoute);

try {
  await connectDB();

  // Initialize Drupal sync
  initDrupalSync();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on port ${PORT}`);
    console.log("Real-time Drupal sync enabled");
  });
} catch (error) {
  console.error("Failed to start server:", error);
  process.exit(1);
}

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
