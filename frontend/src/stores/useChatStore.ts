import { chatService } from "@/services/chatService";
import type { ChatState } from "@/types/store";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "./useAuthStore";
import { useSocketStore } from "./useSocketStore";

const toTimestamp = (value?: string) => {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
};

const sortMessagesChronologically = <
  T extends { createdAt?: string; _id?: string },
>(
  input: T[],
) => {
  return [...input].sort((a, b) => {
    const tsA = toTimestamp(a.createdAt);
    const tsB = toTimestamp(b.createdAt);

    if (tsA !== tsB) {
      return tsA - tsB;
    }

    return String(a._id || "").localeCompare(String(b._id || ""));
  });
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},
      activeConversationId: null,
      convoLoading: false, // convo loading
      messageLoading: false,
      loading: false,
      replyingTo: null,

      setReplyingTo: (message) => set({ replyingTo: message }),
      setActiveConversation: (id) => set({ activeConversationId: id }),
      reset: () => {
        set({
          conversations: [],
          messages: {},
          activeConversationId: null,
          convoLoading: false,
          messageLoading: false,
          replyingTo: null,
        });
      },
      fetchConversations: async () => {
        try {
          set({ convoLoading: true });
          const { conversations } = await chatService.fetchConversations();

          set({ conversations, convoLoading: false });
        } catch (error) {
          console.error("Error fetching conversations:", error);
          set({ convoLoading: false });
        }
      },
      fetchMessages: async (conversationId) => {
        const { activeConversationId, messages } = get();
        const { user } = useAuthStore.getState();

        const convoId = conversationId ?? activeConversationId;

        if (!convoId) return;

        const current = messages?.[convoId];
        const nextCursor =
          current?.nextCursor === undefined ? "" : current?.nextCursor;

        if (nextCursor === null) return;

        set({ messageLoading: true });

        try {
          const { messages: fetched, cursor } = await chatService.fetchMessages(
            convoId,
            nextCursor,
          );

          const processed = fetched.map((m) => ({
            ...m,
            isOwn: m.senderId === user?._id,
          }));

          set((state) => {
            const prev = state.messages[convoId]?.items ?? [];
            const merged =
              prev.length > 0 ? [...processed, ...prev] : processed;
            const normalized = sortMessagesChronologically(merged);

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  items: normalized,
                  hasMore: !!cursor,
                  nextCursor: cursor ?? null,
                },
              },
            };
          });
        } catch (error) {
          console.error("Error fetching messages:", error);
        } finally {
          set({ messageLoading: false });
        }
      },
      sendDirectMessage: async (
        recipientId,
        content,
        imgUrl,
        conversationIdOverride,
        replyTo,
      ) => {
        try {
          const { activeConversationId, addMessage } = get();
          const message = await chatService.sendDirectMessage(
            recipientId,
            content,
            imgUrl,
            conversationIdOverride ?? activeConversationId ?? undefined,
            replyTo,
          );

          // Optimistically append the message immediately instead of waiting for socket
          addMessage(message);

          const targetConversationId =
            conversationIdOverride ?? message.conversationId ?? activeConversationId;

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === targetConversationId ? { ...c, seenBy: [] } : c,
            ),
          }));
        } catch (error) {
          console.error("Error sending direct message", error);
        }
      },
      sendGroupMessage: async (conversationId, content, imgUrl, replyTo) => {
        try {
          const { addMessage } = get();
          const message = await chatService.sendGroupMessage(
            conversationId,
            content,
            imgUrl,
            replyTo,
          );

          // Optimistically append the message immediately
          addMessage(message);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === conversationId ? { ...c, seenBy: [] } : c,
            ),
          }));
        } catch (error) {
          console.error("Error sending group message", error);
        }
      },
      addMessage: (message) => {
        try {
          const { user } = useAuthStore.getState();
          message.isOwn = message.senderId === user?._id;
          const convoId = message.conversationId;

          set((state) => {
            const currentItems = state.messages[convoId]?.items ?? [];
            if (currentItems.some((m) => m._id === message._id)) {
              return state;
            }

            const normalized = sortMessagesChronologically([
              ...currentItems,
              message,
            ]);

            return {
              messages: {
                ...state.messages,
                [convoId]: {
                  ...state.messages[convoId],
                  items: normalized,
                  // Preserve pagination state if it exists, otherwise init it
                  hasMore: state.messages[convoId]?.hasMore ?? false,
                  nextCursor: state.messages[convoId]?.nextCursor ?? undefined,
                },
              },
            };
          });
        } catch (error) {
          console.error("Error adding message:", error);
        }
      },
      updateMessage: (conversationId, messageId, updates) => {
        set((state) => {
          const prev = state.messages[conversationId]?.items;
          if (!prev) return state;

          return {
            messages: {
              ...state.messages,
              [conversationId]: {
                ...state.messages[conversationId],
                items: prev.map((m) =>
                  m._id === messageId ? { ...m, ...updates } : m,
                ),
              },
            },
          };
        });
      },
      removeMessageFromConversation: (conversationId, messageId) => {
        set((state) => {
          const prev = state.messages[conversationId]?.items;
          if (!prev) return state;

          return {
            messages: {
              ...state.messages,
              [conversationId]: {
                ...state.messages[conversationId],
                items: prev.filter((m) => m._id !== messageId),
              },
            },
          };
        });
      },
      reactToMessage: async (conversationId, messageId, emoji) => {
        try {
          const res = await chatService.reactToMessage(messageId, emoji);

          // Backend may return either { message: {...} } or the message object directly.
          const reactions = res?.message?.reactions ?? res?.reactions;
          if (!Array.isArray(reactions)) {
            throw new TypeError("Invalid reactToMessage response payload");
          }

          get().updateMessage(conversationId, messageId, {
            reactions,
          });
        } catch (error) {
          console.error("Reaction error:", error);
        }
      },
      unsendMessage: async (conversationId, messageId) => {
        try {
          await chatService.unsendMessage(messageId);
          get().updateMessage(conversationId, messageId, {
            isDeleted: true,
            content: "This message was removed",
            imgUrl: null,
          });
        } catch (error) {
          console.error("Unsend error:", error);
        }
      },
      removeMessageForMe: async (conversationId, messageId) => {
        try {
          await chatService.removeMessageForMe(messageId);
          get().removeMessageFromConversation(conversationId, messageId);
        } catch (error) {
          console.error("Remove-for-me error:", error);
        }
      },
      editMessage: async (conversationId, messageId, content) => {
        const normalizedContent = content.trim();
        const prevMessage =
          get().messages[conversationId]?.items.find(
            (messageItem) => messageItem._id === messageId,
          ) ?? null;
        const previousContent = prevMessage?.content ?? "";
        const previousEditedAt = prevMessage?.editedAt ?? null;
        const optimisticEditedAt = new Date().toISOString();

        get().updateMessage(conversationId, messageId, {
          content: normalizedContent,
          editedAt: optimisticEditedAt,
        });

        try {
          await chatService.editMessage(messageId, normalizedContent);
        } catch (error) {
          get().updateMessage(conversationId, messageId, {
            content: previousContent,
            editedAt: previousEditedAt,
          });
          console.error("Edit error:", error);
          throw error;
        }
      },

      updateConversation: (conversation) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c._id === conversation._id ? { ...c, ...conversation } : c,
          ),
        }));
      },
      markAsSeen: async () => {
        try {
          const { user } = useAuthStore.getState();
          const { activeConversationId, conversations } = get();

          if (!activeConversationId || !user) {
            return;
          }

          const convo = conversations.find(
            (c) => c._id === activeConversationId,
          );

          if (!convo) {
            return;
          }

          if ((convo.unreadCounts?.[user._id] ?? 0) === 0) {
            return;
          }

          await chatService.markAsSeen(activeConversationId);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === activeConversationId && c.lastMessage
                ? {
                    ...c,
                    unreadCounts: {
                      ...c.unreadCounts,
                      [user._id]: 0,
                    },
                  }
                : c,
            ),
          }));
        } catch (error) {
          console.error("Error calling markAsSeen in store", error);
        }
      },
      addConvo: (convo, options) => {
        const shouldSetActive = options?.setActive ?? false;
        set((state) => {
          const exists = state.conversations.some(
            (c) => c._id.toString() === convo._id.toString(),
          );

          return {
            conversations: exists
              ? state.conversations
              : [convo, ...state.conversations],
            activeConversationId: shouldSetActive
              ? convo._id
              : state.activeConversationId,
          };
        });
      },
      createConversation: async (type, name, memberIds) => {
        try {
          set({ loading: true });
          console.log("[useChatStore][debug] createConversation:", {
            type,
            name,
            memberIds,
          });
          const conversation = await chatService.createConversation(
            type,
            name,
            memberIds,
          );

          if (!conversation?._id) {
            console.error(
              "[useChatStore][error] Invalid conversation response:",
              conversation,
            );
            return false;
          }

          console.log(
            "[useChatStore][ok] Conversation created:",
            conversation._id,
          );
          get().addConvo(conversation, { setActive: true });
          get().setActiveConversation(conversation._id);

          // Join socket room
          const socket = useSocketStore.getState().socket;
          if (socket?.connected) {
            socket.emit("join-conversation", conversation._id);
            console.log(
              "[useChatStore][ok] Joined socket room:",
              conversation._id,
            );
          }

          return true;
        } catch (error) {
          console.error(
            "[useChatStore][error] Error creating conversation:",
            error,
          );
          return false;
        } finally {
          set({ loading: false });
        }
      },
      deleteConversation: async (conversationId) => {
        try {
          set({ loading: true });
          console.log(
            "[useChatStore][debug] Deleting conversation:",
            conversationId,
          );
          await chatService.deleteConversation(conversationId);

          // Remove from store
          set((state) => ({
            conversations: state.conversations.filter(
              (c) => c._id !== conversationId,
            ),
            activeConversationId:
              state.activeConversationId === conversationId
                ? null
                : state.activeConversationId,
          }));

          console.log("[useChatStore][ok] Conversation deleted");
          return true;
        } catch (error) {
          console.error(
            "[useChatStore][error] Error deleting conversation:",
            error,
          );
          return false;
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "chat-storage",
      partialize: (state) => ({ conversations: state.conversations }),
    },
  ),
);
