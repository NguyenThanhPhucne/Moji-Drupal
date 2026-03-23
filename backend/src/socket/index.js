import { Server } from "socket.io";
import http from "node:http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import User from "../models/User.js";

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
  pingInterval: 6000,
  pingTimeout: 3000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000,
  },
});

io.use(socketAuthMiddleware);

const onlineUsers = new Map(); // {userId: Set<socketId>}
const ONLINE_USERS_RESYNC_MS = 15000;

const removeSocketFromOnlineUsers = (userId, socketId) => {
  const userSockets = onlineUsers.get(userId);
  if (!userSockets) {
    return;
  }

  userSockets.delete(socketId);
  if (userSockets.size === 0) {
    onlineUsers.delete(userId);
  }
};

const getVisibleOnlineUserIds = async () => {
  const onlineUserIds = Array.from(onlineUsers.keys());
  if (onlineUserIds.length === 0) {
    return [];
  }

  const users = await User.find({
    _id: { $in: onlineUserIds },
    showOnlineStatus: { $ne: false },
  })
    .select("_id")
    .lean();

  return users.map((user) => String(user._id));
};

export const broadcastOnlineUsers = async () => {
  const visibleOnlineUserIds = await getVisibleOnlineUserIds();
  io.emit("online-users", visibleOnlineUserIds);
};

// Periodic resync guards against rare missed disconnect broadcasts.
setInterval(async () => {
  try {
    await broadcastOnlineUsers();
  } catch (error) {
    console.error("[Socket] periodic online-users resync failed", error);
  }
}, ONLINE_USERS_RESYNC_MS);

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

  await broadcastOnlineUsers();

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

  socket.on("manual-offline", async () => {
    removeSocketFromOnlineUsers(userId, socket.id);
    try {
      await broadcastOnlineUsers();
    } catch (error) {
      console.error(
        "[Socket] broadcast online-users failed on manual-offline",
        error,
      );
    }
  });

  socket.on("disconnect", async () => {
    console.log(
      `[Socket] User disconnected: ${user.displayName} (${userId}) - socketId: ${socket.id}`,
    );
    removeSocketFromOnlineUsers(userId, socket.id);
    try {
      await broadcastOnlineUsers();
    } catch (error) {
      console.error(
        "[Socket] broadcast online-users failed on disconnect",
        error,
      );
    }
  });
});

export { io, app, server };
