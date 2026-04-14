import { Server } from "socket.io";
import http from "node:http";
import express from "express";
import { socketAuthMiddleware } from "../middlewares/socketMiddleware.js";
import { getUserConversationsForSocketIO } from "../controllers/conversationController.js";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";

const app = express();

const server = http.createServer(app);
const IS_PRODUCTION =
  String(process.env.NODE_ENV || "").toLowerCase() === "production";

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
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const isLoopbackOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return LOCALHOST_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
};

const isAllowedSocketOrigin = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  if (!IS_PRODUCTION && isLoopbackOrigin(origin)) {
    return true;
  }

  return false;
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedSocketOrigin(origin));
    },
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
const CONVERSATION_ACCESS_REVALIDATE_MS = 15000;
const TYPING_EMIT_THROTTLE_MS = 300;
const typingEmitTimelineBySocket = new Map(); // {socketId: Map<conversationId, ts>}
const MONGO_OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const normalizeConversationId = (value) => String(value || "").trim();

const ensureSocketConversationAccess = async ({
  socket,
  userId,
  conversationId,
  authorizedConversationIds,
  authorizationCheckedAtByConversation,
}) => {
  const normalizedConversationId = normalizeConversationId(conversationId);
  if (!MONGO_OBJECT_ID_PATTERN.test(normalizedConversationId)) {
    return null;
  }

  const now = Date.now();
  const lastCheckedAt =
    authorizationCheckedAtByConversation.get(normalizedConversationId) || 0;
  const shouldRevalidateMembership =
    !authorizedConversationIds.has(normalizedConversationId) ||
    now - lastCheckedAt > CONVERSATION_ACCESS_REVALIDATE_MS;

  if (shouldRevalidateMembership) {
    const membership = await Conversation.exists({
      _id: normalizedConversationId,
      "participants.userId": userId,
    });

    if (!membership) {
      authorizedConversationIds.delete(normalizedConversationId);
      authorizationCheckedAtByConversation.delete(normalizedConversationId);
      socket.leave(normalizedConversationId);
      return null;
    }

    authorizedConversationIds.add(normalizedConversationId);
    authorizationCheckedAtByConversation.set(normalizedConversationId, now);
  }

  socket.join(normalizedConversationId);
  return normalizedConversationId;
};

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

  console.info(
    `[Socket] connected: ${user.displayName} (${userId})`
  );

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  // Join user room ngay để không bỏ lỡ các sự kiện private-user ngay sau connect.
  socket.join(userId);

  await broadcastOnlineUsers();

  const conversationIds = await getUserConversationsForSocketIO(user._id);
  const authorizedConversationIds = new Set(
    conversationIds
      .map((conversationId) => normalizeConversationId(conversationId))
      .filter(Boolean),
  );
  const authorizationCheckedAtByConversation = new Map(
    Array.from(authorizedConversationIds).map((conversationId) => [
      conversationId,
      Date.now(),
    ]),
  );

  authorizedConversationIds.forEach((conversationId) => {
    socket.join(conversationId);
  });

  socket.on("join-conversation", async (conversationId) => {
    const joinedConversationId = await ensureSocketConversationAccess({
      socket,
      userId,
      conversationId,
      authorizedConversationIds,
      authorizationCheckedAtByConversation,
    });

    if (!joinedConversationId) {
      console.warn(
        `[Socket] blocked unauthorized join attempt for user ${userId} to conversation ${normalizeConversationId(conversationId)}`,
      );
    }
  });

  socket.on("typing", async (conversationId) => {
    const authorizedConversationId = await ensureSocketConversationAccess({
      socket,
      userId,
      conversationId,
      authorizedConversationIds,
      authorizationCheckedAtByConversation,
    });

    if (!authorizedConversationId) {
      return;
    }

    const now = Date.now();
    let socketTypingTimeline = typingEmitTimelineBySocket.get(socket.id);
    if (!socketTypingTimeline) {
      socketTypingTimeline = new Map();
      typingEmitTimelineBySocket.set(socket.id, socketTypingTimeline);
    }

    const lastEmitAt = socketTypingTimeline.get(authorizedConversationId) || 0;
    if (now - lastEmitAt < TYPING_EMIT_THROTTLE_MS) {
      return;
    }

    socketTypingTimeline.set(authorizedConversationId, now);

    socket.to(authorizedConversationId).emit("user-typing", {
      conversationId: authorizedConversationId,
      userId,
      displayName: user.displayName,
    });
  });

  socket.on("stop_typing", async (conversationId) => {
    const authorizedConversationId = await ensureSocketConversationAccess({
      socket,
      userId,
      conversationId,
      authorizedConversationIds,
      authorizationCheckedAtByConversation,
    });

    if (!authorizedConversationId) {
      return;
    }

    const socketTypingTimeline = typingEmitTimelineBySocket.get(socket.id);
    if (socketTypingTimeline) {
      socketTypingTimeline.delete(authorizedConversationId);
      if (socketTypingTimeline.size === 0) {
        typingEmitTimelineBySocket.delete(socket.id);
      }
    }

    socket.to(authorizedConversationId).emit("user-stop_typing", {
      conversationId: authorizedConversationId,
      userId,
    });
  });

  socket.on("leave-conversation", (conversationId) => {
    const normalizedConversationId = normalizeConversationId(conversationId);
    if (!MONGO_OBJECT_ID_PATTERN.test(normalizedConversationId)) {
      return;
    }

    socket.leave(normalizedConversationId);
    authorizedConversationIds.delete(normalizedConversationId);
    authorizationCheckedAtByConversation.delete(normalizedConversationId);

    const socketTypingTimeline = typingEmitTimelineBySocket.get(socket.id);
    if (socketTypingTimeline) {
      socketTypingTimeline.delete(normalizedConversationId);
      if (socketTypingTimeline.size === 0) {
        typingEmitTimelineBySocket.delete(socket.id);
      }
    }
  });

  socket.on("manual-offline", async () => {
    typingEmitTimelineBySocket.delete(socket.id);
    removeSocketFromOnlineUsers(userId, socket.id);
    try {
      await User.findByIdAndUpdate(userId, { lastActiveAt: new Date() });
      await broadcastOnlineUsers();
    } catch (error) {
      console.error(
        "[Socket] broadcast online-users failed on manual-offline",
        error,
      );
    }
  });

  socket.on("disconnect", async () => {
    console.info(
      `[Socket] disconnected: ${user.displayName} (${userId})`
    );
    typingEmitTimelineBySocket.delete(socket.id);
    removeSocketFromOnlineUsers(userId, socket.id);
    try {
      if (!onlineUsers.has(userId)) {
        await User.findByIdAndUpdate(userId, { lastActiveAt: new Date() });
      }
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
