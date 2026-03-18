import { Server } from "socket.io";
import http from "node:http";
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
  // Giảm thời gian phát hiện mất kết nối để trạng thái online/offline mượt hơn.
  pingInterval: 10000,
  pingTimeout: 5000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000,
  },
});

io.use(socketAuthMiddleware);

const onlineUsers = new Map(); // {userId: Set<socketId>}

io.on("connection", async (socket) => {
  const user = socket.user;
  const userId = user._id.toString();

  console.log(
    `[Socket] User connected: ${user.displayName} (${userId}) - socketId: ${socket.id}`,
  );

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  // Join user room ngay để không bỏ lỡ các sự kiện private-user ngay sau connect.
  socket.join(userId);
  console.log(`[Socket] Joined user room: ${userId}`);

  io.emit("online-users", Array.from(onlineUsers.keys()));

  const conversationIds = await getUserConversationsForSocketIO(user._id);
  console.log("[Socket] Joined conversation rooms:", conversationIds);
  conversationIds.forEach((id) => {
    socket.join(id);
  });

  socket.on("join-conversation", (conversationId) => {
    if (!conversationId) {
      return;
    }

    console.log(
      `[Socket] join-conversation: ${user.displayName} joined room ${conversationId}`,
    );
    socket.join(conversationId);
  });

  socket.on("typing", (conversationId) => {
    socket.to(conversationId).emit("user-typing", {
      conversationId,
      userId,
      displayName: user.displayName,
    });
  });

  socket.on("stop_typing", (conversationId) => {
    socket.to(conversationId).emit("user-stop_typing", {
      conversationId,
      userId,
    });
  });

  socket.on("disconnect", () => {
    console.log(
      `[Socket] User disconnected: ${user.displayName} (${userId}) - socketId: ${socket.id}`,
    );
    const userSockets = onlineUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }
    io.emit("online-users", Array.from(onlineUsers.keys()));
  });
});

export { io, app, server };
