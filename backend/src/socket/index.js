import { Server } from "socket.io";
import http from "http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";

const app = express();

const server = http.createServer(app);

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

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

const onlineUsers = new Map(); // {userId: socketId}

io.on("connection", async (socket) => {
  const user = socket.user;
  const userId = user._id.toString();

  console.log(
    `[Socket] User connected: ${user.displayName} (${userId}) - socketId: ${socket.id}`,
  );

  onlineUsers.set(user._id, socket.id);

  io.emit("online-users", Array.from(onlineUsers.keys()));

  const conversationIds = await getUserConversationsForSocketIO(user._id);
  console.log("[Socket] Joined conversation rooms:", conversationIds);
  conversationIds.forEach((id) => {
    socket.join(id);
  });

  socket.on("join-conversation", (conversationId) => {
    console.log(
      `[Socket] join-conversation: ${user.displayName} joined room ${conversationId}`,
    );
    socket.join(conversationId);
  });

  socket.join(userId);
  console.log(`[Socket] Joined user room: ${userId}`);

  socket.on("disconnect", () => {
    console.log(`[Socket] User disconnected: ${user.displayName} (${userId})`);
    onlineUsers.delete(user._id);
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });
});

export { io, app, server };
