import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useNotificationStore } from "./useNotificationStore";
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
        console.warn(
          `[Socket] Ignoring VITE_SOCKET_URL=${socketUrl} in dev because VITE_NODE_API is local proxy (${nodeApiUrl}). Using same-origin socket via Vite proxy instead.`,
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

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
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
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    set({ socket });

    socket.on("connect", () => {
      console.log("Socket connected");

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
      set({ onlineUsers: [] });
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
      set({ onlineUsers: normalizedUserIds });
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
      console.log("Received new-group event:", conversation);
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
      toast.success(
        `You were added to group "${conversation.group?.name || "New group"}"!`,
      );
    });

    // new direct conversation - from other participant
    socket.on("new-conversation", (conversation) => {
      console.log("Received new-conversation event:", conversation);
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
      toast.success("You have a new conversation!");
    });

    // conversation deleted - from other participants
    socket.on("conversation-deleted", ({ conversationId }) => {
      console.log("Received conversation-deleted event:", conversationId);
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

    socket.on("message-deleted", ({ conversationId, messageId }) => {
      useChatStore.getState().updateMessage(conversationId, messageId, {
        isDeleted: true,
        content: "This message was removed",
        imgUrl: null,
      });
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
      console.log("Received friend request:", request);
      useNotificationStore.getState().addPendingRequest(request);
      toast.success(message, {
        description: `${request.from.displayName} (@${request.from.username}) sent a friend request`,
        action: {
          label: "View",
          onClick: () => {
            // Open a dialog here if needed.
          },
        },
      });
    });

    // Friend request accepted - notification when someone accepts your request
    socket.on("friend-request-accepted", ({ from, message }) => {
      console.log("Friend request accepted:", from);
      console.log("Adding to notification store...");
      try {
        useNotificationStore.getState().addAcceptanceNotification({
          type: "friend-accepted",
          from,
          message,
          createdAt: new Date(),
        });
        console.log(
          "Notification stored:",
          useNotificationStore.getState().acceptanceNotifications,
        );
      } catch (error) {
        console.error("Error adding notification:", error);
      }
      toast.success(message, {
        description: `${from?.displayName} is now your friend!`,
      });
    });
  },
  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.removeAllListeners(); // Remove all listeners before disconnect
      socket.disconnect();
      set({ socket: null, onlineUsers: [] });
      return;
    }

    set({ onlineUsers: [] });
  },
}));
