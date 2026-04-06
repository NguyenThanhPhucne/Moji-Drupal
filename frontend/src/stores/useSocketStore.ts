import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useSocialStore } from "./useSocialStore";
import { toast } from "sonner";

const resolveSocketBaseUrl = () => {
  const socketUrl = String(import.meta.env.VITE_SOCKET_URL || "").trim();
  const nodeApiUrl = String(import.meta.env.VITE_NODE_API || "").trim();
  const isDev = import.meta.env.DEV;

  // If NODE API uses local proxy (/api/node) but socket points to a different host in dev,
  // realtime can split-brain (API on one server, socket on another).
  if (isDev && nodeApiUrl.startsWith("/") && socketUrl) {
    try {
      const socketHost = new URL(socketUrl).host;
      const currentHost = globalThis.location.host;
      if (socketHost !== currentHost) {
        console.info(
          `[Socket] Using same-origin socket via Vite proxy (VITE_NODE_API=${nodeApiUrl}).`,
        );
        return undefined;
      }
    } catch {
      // Invalid socketUrl -> fallback to same-origin.
      return undefined;
    }
  }

  if (socketUrl) {
    return socketUrl;
  }

  // Fallback: if NODE API is absolute URL, use that origin for socket.
  if (nodeApiUrl.startsWith("http://") || nodeApiUrl.startsWith("https://")) {
    try {
      return new URL(nodeApiUrl).origin;
    } catch {
      return undefined;
    }
  }

  // Local proxy or missing config -> same-origin.
  return undefined;
};

const baseURL = resolveSocketBaseUrl();
const RECENTLY_ACTIVE_WINDOW_MS = 4000;

let recentActiveCleanupTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleRecentActiveCleanup = () => {
  if (recentActiveCleanupTimer) {
    clearTimeout(recentActiveCleanupTimer);
    recentActiveCleanupTimer = null;
  }

  const recentValues = Object.values(
    useSocketStore.getState().recentActiveUsers,
  );
  if (recentValues.length === 0) {
    return;
  }

  const soonestExpiry = Math.min(...recentValues);
  const delay = Math.max(0, soonestExpiry - Date.now()) + 50;

  recentActiveCleanupTimer = setTimeout(() => {
    const now = Date.now();
    useSocketStore.setState((state) => {
      const nextRecentActiveUsers = Object.fromEntries(
        Object.entries(state.recentActiveUsers).filter(
          ([, expiry]) => expiry > now,
        ),
      );

      if (
        Object.keys(nextRecentActiveUsers).length ===
        Object.keys(state.recentActiveUsers).length
      ) {
        return state;
      }

      return { recentActiveUsers: nextRecentActiveUsers };
    });

    scheduleRecentActiveCleanup();
  }, delay);
};

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  recentActiveUsers: {},
  lastActiveByUser: {},
  isUserOnline: (userId) => {
    return get().getUserPresence(userId) === "online";
  },
  getUserPresence: (userId) => {
    if (!userId) {
      return "offline";
    }

    const normalized = String(userId);
    const onlineSet = new Set(get().onlineUsers);
    if (onlineSet.has(normalized)) {
      return "online";
    }

    const expiry = get().recentActiveUsers[normalized];
    if (expiry && expiry > Date.now()) {
      return "recently-active";
    }

    return "offline";
  },
  getLastActiveAt: (userId) => {
    if (!userId) {
      return null;
    }

    return get().lastActiveByUser[String(userId)] || null;
  },
  connectSocket: () => {
    const accessToken = useAuthStore.getState().accessToken;
    const existingSocket = get().socket;

    // Avoid recreating socket if current socket is connected or reconnecting.
    if (existingSocket && (existingSocket.connected || existingSocket.active)) {
      return;
    }

    if (!accessToken) {
      return;
    }

    // Cleanup existing socket if any
    if (existingSocket) {
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
    }

    const socket: Socket = io(baseURL, {
      auth: { token: accessToken },
      withCredentials: true,
      path: "/socket.io",
      transports: ["websocket", "polling"],
      closeOnBeforeunload: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    set({ socket });

    socket.on("connect", () => {
      // Proactively join known rooms to reduce missed events
      // while backend is still fetching conversations.
      const conversations = useChatStore.getState().conversations || [];
      conversations.forEach((conversationItem) => {
        if (conversationItem?._id) {
          socket.emit("join-conversation", conversationItem._id);
        }
      });

      const activeConversationId = useChatStore.getState().activeConversationId;
      if (activeConversationId) {
        socket.emit("join-conversation", activeConversationId);
      }
    });

    socket.on("reconnect_attempt", () => {
      const latestToken = useAuthStore.getState().accessToken;
      if (latestToken) {
        socket.auth = { token: latestToken };
      }
    });

    socket.on("connect_error", async (error) => {
      console.error("Socket connect_error:", error?.message || error);

      // If stale token is rejected during handshake, refresh and reconnect.
      if (
        String(error?.message || "")
          .toLowerCase()
          .includes("unauthorized")
      ) {
        try {
          await useAuthStore.getState().refresh();
          const refreshedToken = useAuthStore.getState().accessToken;
          if (refreshedToken) {
            socket.auth = { token: refreshedToken };
            socket.connect();
          }
        } catch (refreshError) {
          console.error("Socket refresh token failed:", refreshError);
        }
      }
    });

    socket.on("disconnect", (reason) => {
      console.warn("Socket disconnected:", reason);

      const now = Date.now();
      const offlineSnapshot = get().onlineUsers.reduce<Record<string, number>>(
        (acc, userId) => {
          acc[userId] = now;
          return acc;
        },
        {},
      );

      set((state) => ({
        onlineUsers: [],
        recentActiveUsers: {},
        lastActiveByUser: {
          ...state.lastActiveByUser,
          ...offlineSnapshot,
        },
      }));
    });

    socket.on("reconnect", () => {
      const activeConversationId = useChatStore.getState().activeConversationId;
      if (activeConversationId) {
        socket.emit("join-conversation", activeConversationId);
      }
    });

    // online users
    socket.on("online-users", (userIds) => {
      const normalizedUserIds = Array.isArray(userIds)
        ? userIds.map(String)
        : [];

      const now = Date.now();
      const previousOnlineSet = new Set(get().onlineUsers);
      const nextOnlineSet = new Set(normalizedUserIds);
      const nextRecentActiveUsers = { ...get().recentActiveUsers };
      const nextLastActiveByUser = { ...get().lastActiveByUser };

      previousOnlineSet.forEach((userId) => {
        if (!nextOnlineSet.has(userId)) {
          nextRecentActiveUsers[userId] = now + RECENTLY_ACTIVE_WINDOW_MS;
          nextLastActiveByUser[userId] = now;
        }
      });

      normalizedUserIds.forEach((userId) => {
        delete nextRecentActiveUsers[userId];
        nextLastActiveByUser[userId] = now;
      });

      Object.keys(nextRecentActiveUsers).forEach((userId) => {
        if (nextRecentActiveUsers[userId] <= now) {
          delete nextRecentActiveUsers[userId];
        }
      });

      set({
        onlineUsers: normalizedUserIds,
        recentActiveUsers: nextRecentActiveUsers,
        lastActiveByUser: nextLastActiveByUser,
      });

      scheduleRecentActiveCleanup();
    });

    // new message
    socket.on("new-message", ({ message, conversation, unreadCounts }) => {
      useChatStore.getState().addMessage(message);

      const lastMessage = {
        _id: conversation.lastMessage._id,
        content: conversation.lastMessage.content,
        createdAt: conversation.lastMessage.createdAt,
        sender: {
          _id: conversation.lastMessage.senderId,
          displayName: "",
          avatarUrl: null,
        },
      };

      const updatedConversation = {
        ...conversation,
        lastMessage,
        unreadCounts: unreadCounts || {},
      };

      const existingConversation = useChatStore
        .getState()
        .conversations.find((c) => c._id === conversation._id);

      if (!existingConversation) {
        useChatStore.getState().fetchConversations();
      }

      if (
        useChatStore.getState().activeConversationId === message.conversationId
      ) {
        useChatStore.getState().markAsSeen();
      }

      useChatStore.getState().updateConversation(updatedConversation);
    });

    // read message
    socket.on("read-message", ({ conversation, lastMessage }) => {
      const updated = {
        _id: conversation._id,
        lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unreadCounts: conversation.unreadCounts,
        seenBy: conversation.seenBy,
      };

      useChatStore.getState().updateConversation(updated);
    });

    // new group chat - from other members
    socket.on("new-group", (conversation) => {
      useChatStore.getState().addConvo(conversation, { setActive: false });
      socket.emit("join-conversation", conversation._id);
      toast.success(
        `You were added to group "${conversation.group?.name || "New group"}"!`,
      );
    });

    // new direct conversation - from other participant
    socket.on("new-conversation", (conversation) => {
      useChatStore.getState().addConvo(conversation, { setActive: false });
      socket.emit("join-conversation", conversation._id);
      toast.success("You have a new conversation!");
    });

    // conversation deleted - from other participants
    socket.on("conversation-deleted", ({ conversationId }) => {
      const currentState = useChatStore.getState();
      const nextConversations = currentState.conversations.filter(
        (conversationItem) => conversationItem._id !== conversationId,
      );

      useChatStore.setState({
        conversations: nextConversations,
        activeConversationId:
          currentState.activeConversationId === conversationId
            ? null
            : currentState.activeConversationId,
      });

      toast.info("A conversation was deleted");
    });

    // message modifications
    socket.on("message-reacted", ({ conversationId, messageId, reactions }) => {
      useChatStore
        .getState()
        .updateMessage(conversationId, messageId, { reactions });
    });

    socket.on("message-deleted", ({ conversationId, messageId, conversation }) => {
      useChatStore.getState().updateMessage(conversationId, messageId, {
        isDeleted: true,
        content: "This message was removed",
        imgUrl: null,
      });

      if (conversation?._id) {
        useChatStore.getState().updateConversation(conversation);
      }
    });

    socket.on("message-hidden-for-user", ({ conversationId, messageId }) => {
      useChatStore
        .getState()
        .removeMessageFromConversation(conversationId, messageId);
    });

    socket.on(
      "message-edited",
      ({ conversationId, messageId, content, editedAt }) => {
        useChatStore
          .getState()
          .updateMessage(conversationId, messageId, { content, editedAt });
      },
    );

    socket.on("message-read", ({ conversationId, messageId, readBy }) => {
      useChatStore
        .getState()
        .updateMessage(conversationId, messageId, { readBy });
    });

    // Friend request received - real-time notification
    socket.on("friend-request-received", ({ request, message }) => {
      useFriendStore.getState().addReceivedRequest(request);
      useNotificationStore.getState().incrementUnreadCount();
      toast.success(message, {
        description: `${request.from.displayName} (@${request.from.username}) sent a friend request`,
        action: {
          label: "View",
          onClick: () => {
            useNotificationStore.getState().setIsHubOpen(true);
          },
        },
      });
    });

    // Friend request accepted - notification when someone accepts your request
    socket.on("friend-request-accepted", ({ from, message }) => {
      try {
        useNotificationStore.getState().addAcceptanceNotification({
          type: "friend-accepted",
          from,
          message,
          createdAt: new Date(),
        });
      } catch (error) {
        console.error("Error adding notification:", error);
      }
      toast.success(message, {
        description: `${from?.displayName} đã trở thành bạn bè của bạn!`,
        action: {
          label: "Xem",
          onClick: () => {
            useNotificationStore.getState().setIsHubOpen(true);
          },
        },
      });
    });

    socket.on("social-notification", ({ notification }) => {
      if (!notification) {
        return;
      }

      useNotificationStore.getState().addSocialNotification(notification);
      useSocialStore.setState((state) => ({
        notifications: [notification, ...state.notifications],
      }));

      const actorName = notification.actorId?.displayName || "Someone";
      const fallbackMessage = notification.message || "sent an update";

      if (notification.type === "comment") {
        toast.info(`${actorName} commented on your post`, {
          description: fallbackMessage,
        });
        return;
      }

      if (notification.type === "like") {
        toast.info(`${actorName} liked your post`, {
          description: fallbackMessage,
        });
        return;
      }

      if (notification.type === "follow") {
        toast.success(`${actorName} started following you`, {
          description: fallbackMessage,
        });
        return;
      }

      toast.info(`${actorName} ${fallbackMessage}`);
    });
  },
  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      if (socket.connected) {
        socket.emit("manual-offline");
      }
      socket.removeAllListeners(); // Remove all listeners before disconnect
      socket.disconnect();

      const now = Date.now();
      const offlineSnapshot = get().onlineUsers.reduce<Record<string, number>>(
        (acc, userId) => {
          acc[userId] = now;
          return acc;
        },
        {},
      );

      set((state) => ({
        socket: null,
        onlineUsers: [],
        recentActiveUsers: {},
        lastActiveByUser: {
          ...state.lastActiveByUser,
          ...offlineSnapshot,
        },
      }));
      return;
    }

    set({ onlineUsers: [], recentActiveUsers: {} });
  },
}));
