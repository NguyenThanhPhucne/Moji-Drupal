import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useNotificationStore } from "./useNotificationStore";
import { toast } from "sonner";

const baseURL = import.meta.env.VITE_SOCKET_URL;

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  onlineUsers: [],
  connectSocket: () => {
    const accessToken = useAuthStore.getState().accessToken;
    const existingSocket = get().socket;

    if (existingSocket?.connected) return; // tránh tạo nhiều socket

    // Cleanup existing socket if any
    if (existingSocket) {
      existingSocket.removeAllListeners();
      existingSocket.disconnect();
    }

    const socket: Socket = io(baseURL, {
      auth: { token: accessToken },
      transports: ["websocket"],
    });

    set({ socket });

    socket.on("connect", () => {
      console.log("Đã kết nối với socket");
    });

    // online users
    socket.on("online-users", (userIds) => {
      set({ onlineUsers: userIds });
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
        unreadCounts,
      };

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
      console.log("📨 Received new-group event:", conversation);
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
      toast.success(
        `Bạn đã được thêm vào nhóm "${conversation.group?.name || "Nhóm mới"}"! 🎉`,
      );
    });

    // new direct conversation - from other participant
    socket.on("new-conversation", (conversation) => {
      console.log("📨 Received new-conversation event:", conversation);
      useChatStore.getState().addConvo(conversation);
      socket.emit("join-conversation", conversation._id);
      toast.success(`Bạn có cuộc trò chuyện mới! 💬`);
    });

    // conversation deleted - from other participants
    socket.on("conversation-deleted", ({ conversationId }) => {
      console.log("🗑️ Received conversation-deleted event:", conversationId);
      // Only remove from store (don't call API again)
      set((state) => ({
        // This will be handled by chat store, just log it
      }));
      useChatStore.getState().updateConversation({
        _id: conversationId,
        deleted: true,
      });
      // Remove from conversations list
      useChatStore.setState((state) => ({
        conversations: state.conversations.filter(
          (c) => c._id !== conversationId,
        ),
        activeConversationId:
          state.activeConversationId === conversationId
            ? null
            : state.activeConversationId,
      }));
      toast.info("Một cuộc hội thoại đã bị xoá");
    });

    // Friend request received - real-time notification
    socket.on("friend-request-received", ({ request, message }) => {
      console.log("💌 Received friend request:", request);
      useNotificationStore.getState().addPendingRequest(request);
      toast.success(message, {
        description: `${request.from.displayName} (@${request.from.username}) gửi lời mời kết bạn`,
        action: {
          label: "Xem",
          onClick: () => {
            // Có thể mở dialog ở đây nếu muốn
          },
        },
      });
    });

    // Friend request accepted - notification when someone accepts your request
    socket.on("friend-request-accepted", ({ from, message }) => {
      console.log("✅ Friend request accepted:", from);
      console.log("📦 Adding to notification store...");
      try {
        useNotificationStore.getState().addAcceptanceNotification({
          type: "friend-accepted",
          from,
          message,
          createdAt: new Date(),
        });
        console.log(
          "✅ Notification stored:",
          useNotificationStore.getState().acceptanceNotifications,
        );
      } catch (error) {
        console.error("❌ Error adding notification:", error);
      }
      toast.success(message, {
        description: `${from?.displayName} bây giờ là bạn bè của bạn! 🎉`,
      });
    });
  },
  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) {
      socket.removeAllListeners(); // Remove all listeners before disconnect
      socket.disconnect();
      set({ socket: null, onlineUsers: [] });
    }
  },
}));
