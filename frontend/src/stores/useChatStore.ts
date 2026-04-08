import { chatService } from "@/services/chatService";
import type { Conversation } from "@/types/chat";
import type { ChatState } from "@/types/store";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "./useAuthStore";
import { useSocketStore } from "./useSocketStore";
import { toast } from "sonner";

const buildTempDirectConversationId = (recipientId: string) => {
  return `temp-direct-${String(recipientId)}`;
};

const isPersistedConversationId = (value?: string | null) => {
  return /^[a-f\d]{24}$/i.test(String(value || "").trim());
};

const buildOptimisticDirectConversation = ({
  conversationId,
  recipientId,
  currentUserId,
  currentUserDisplayName,
  currentUserAvatar,
  knownRecipientDisplayName,
  knownRecipientAvatar,
  previewContent,
  previewCreatedAt,
}: {
  conversationId: string;
  recipientId: string;
  currentUserId: string;
  currentUserDisplayName: string;
  currentUserAvatar?: string | null;
  knownRecipientDisplayName?: string;
  knownRecipientAvatar?: string | null;
  previewContent: string;
  previewCreatedAt: string;
}): Conversation => {
  return {
    _id: conversationId,
    type: "direct",
    group: {
      name: "",
      createdBy: currentUserId,
    },
    participants: [
      {
        _id: currentUserId,
        displayName: currentUserDisplayName,
        avatarUrl: currentUserAvatar ?? null,
        joinedAt: previewCreatedAt,
      },
      {
        _id: recipientId,
        displayName: knownRecipientDisplayName || "New chat",
        avatarUrl: knownRecipientAvatar ?? null,
        joinedAt: previewCreatedAt,
      },
    ],
    lastMessageAt: previewCreatedAt,
    seenBy: [],
    lastMessage: {
      _id: `${conversationId}-preview`,
      content: previewContent,
      createdAt: previewCreatedAt,
      sender: {
        _id: currentUserId,
        displayName: currentUserDisplayName,
        avatarUrl: currentUserAvatar ?? null,
      },
    },
    unreadCounts: {
      [currentUserId]: 0,
    },
    createdAt: previewCreatedAt,
    updatedAt: previewCreatedAt,
  };
};

const ensureOptimisticDirectConversation = ({
  recipientId,
  targetConversationId,
  nowIso,
  optimisticPreviewContent,
  user,
  getState,
  setState,
}: {
  recipientId: string;
  targetConversationId: string | null;
  nowIso: string;
  optimisticPreviewContent: string;
  user: {
    _id?: string;
    displayName?: string;
    avatarUrl?: string | null;
  } | null;
  getState: () => {
    conversations: Conversation[];
    activeConversationId: string | null;
  };
  setState: typeof useChatStore.setState;
}) => {
  if (targetConversationId || !recipientId) {
    return {
      optimisticConversationId: targetConversationId,
      createdTempConversation: false,
    };
  }

  const optimisticConversationId = buildTempDirectConversationId(recipientId);
  const state = getState();
  const existingTempConversation = state.conversations.find(
    (conversationItem) => conversationItem._id === optimisticConversationId,
  );

  if (!existingTempConversation) {
    const knownRecipient = state.conversations
      .flatMap((conversationItem) => conversationItem.participants)
      .find((participant) => String(participant._id) === String(recipientId));

    const optimisticConversation = buildOptimisticDirectConversation({
      conversationId: optimisticConversationId,
      recipientId: String(recipientId),
      currentUserId: String(user?._id || ""),
      currentUserDisplayName: String(user?.displayName || "You"),
      currentUserAvatar: user?.avatarUrl ?? null,
      knownRecipientDisplayName: knownRecipient?.displayName,
      knownRecipientAvatar: knownRecipient?.avatarUrl ?? null,
      previewContent: optimisticPreviewContent,
      previewCreatedAt: nowIso,
    });

    setState((stateSnapshot) => ({
      conversations: [optimisticConversation, ...stateSnapshot.conversations],
      activeConversationId: optimisticConversationId,
    }));

    return {
      optimisticConversationId,
      createdTempConversation: true,
    };
  }

  if (!state.activeConversationId) {
    setState({ activeConversationId: optimisticConversationId });
  }

  return {
    optimisticConversationId,
    createdTempConversation: false,
  };
};

const pruneTempConversationState = ({
  optimisticConversationId,
  fallbackActiveConversationId,
  setState,
}: {
  optimisticConversationId: string;
  fallbackActiveConversationId: string | null;
  setState: typeof useChatStore.setState;
}) => {
  setState((state) => {
    const nextMessages = { ...state.messages };
    delete nextMessages[optimisticConversationId];

    return {
      conversations: state.conversations.filter(
        (conversationItem) => conversationItem._id !== optimisticConversationId,
      ),
      messages: nextMessages,
      activeConversationId:
        state.activeConversationId === optimisticConversationId
          ? fallbackActiveConversationId
          : state.activeConversationId,
    };
  });
};

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

const messageMutationVersions = new Map<string, number>();

const startMessageMutation = (mutationKey: string) => {
  const nextVersion = (messageMutationVersions.get(mutationKey) || 0) + 1;
  messageMutationVersions.set(mutationKey, nextVersion);
  return nextVersion;
};

const isLatestMessageMutation = (mutationKey: string, version: number) => {
  return messageMutationVersions.get(mutationKey) === version;
};

const clearMessageMutation = (mutationKey: string, version: number) => {
  if (isLatestMessageMutation(mutationKey, version)) {
    messageMutationVersions.delete(mutationKey);
  }
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
              
            // Deduplicate (prevent React StrictMode race condition from duplicating messages)
            const uniqueMap = new Map();
            merged.forEach((m) => uniqueMap.set(m._id, m));
            const normalized = sortMessagesChronologically(Array.from(uniqueMap.values()));

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
        const { activeConversationId, user } = {
          activeConversationId: get().activeConversationId,
          user: useAuthStore.getState().user,
        };
        const targetConversationId =
          conversationIdOverride ?? activeConversationId;
        const resolvedConversationId = isPersistedConversationId(
          targetConversationId,
        )
          ? targetConversationId
          : null;
        const nowIso = new Date().toISOString();
        const optimisticPreviewContent =
          String(content || "").trim() || (imgUrl ? "📷 Photo" : "New message");

        const {
          optimisticConversationId,
          createdTempConversation,
        } = ensureOptimisticDirectConversation({
          recipientId,
          targetConversationId,
          nowIso,
          optimisticPreviewContent,
          user,
          getState: () => ({
            conversations: get().conversations,
            activeConversationId: get().activeConversationId,
          }),
          setState: set,
        });

        // Build an optimistic message to show immediately
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const optimisticMessage = {
          _id: tempId,
          conversationId: optimisticConversationId ?? "",
          senderId: user?._id ?? "",
          content: content ?? "",
          imgUrl: imgUrl ?? null,
          replyTo: replyTo ? { _id: replyTo } : null,
          reactions: [],
          isDeleted: false,
          editedAt: null,
          readBy: [],
          hiddenFor: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          isOwn: true,
        };

        if (optimisticConversationId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          get().addMessage(optimisticMessage as any);
        }

        try {
          const message = await chatService.sendDirectMessage(
            recipientId,
            content,
            imgUrl,
            resolvedConversationId ?? undefined,
            replyTo,
          );

          // Replace temp message with real one from server
          if (optimisticConversationId) {
            get().removeMessageFromConversation(optimisticConversationId, tempId);
          }

          const realConvoId =
            conversationIdOverride ?? message.conversationId ?? activeConversationId;

          if (
            optimisticConversationId &&
            realConvoId &&
            optimisticConversationId !== realConvoId
          ) {
            pruneTempConversationState({
              optimisticConversationId,
              fallbackActiveConversationId: realConvoId,
              setState: set,
            });
          }

          get().addMessage(message);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === realConvoId ? { ...c, seenBy: [] } : c,
            ),
          }));

          if (createdTempConversation) {
            void get().fetchConversations();
          }
        } catch (error) {
          // Rollback: remove the optimistic message
          if (optimisticConversationId) {
            get().removeMessageFromConversation(optimisticConversationId, tempId);
          }

          if (createdTempConversation && optimisticConversationId) {
            pruneTempConversationState({
              optimisticConversationId,
              fallbackActiveConversationId: null,
              setState: set,
            });
          }

          toast.error("Failed to send message. Please try again.");
          console.error("Error sending direct message", error);
        }
      },
      sendGroupMessage: async (conversationId, content, imgUrl, replyTo) => {
        const user = useAuthStore.getState().user;

        // Optimistic message
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const optimisticMessage = {
          _id: tempId,
          conversationId,
          senderId: user?._id ?? "",
          content: content ?? "",
          imgUrl: imgUrl ?? null,
          replyTo: replyTo ? { _id: replyTo } : null,
          reactions: [],
          isDeleted: false,
          editedAt: null,
          readBy: [],
          hiddenFor: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isOwn: true,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get().addMessage(optimisticMessage as any);

        try {
          const { addMessage } = get();
          const message = await chatService.sendGroupMessage(
            conversationId,
            content,
            imgUrl,
            replyTo,
          );

          // Replace temp with real
          get().removeMessageFromConversation(conversationId, tempId);
          addMessage(message);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === conversationId ? { ...c, seenBy: [] } : c,
            ),
          }));
        } catch (error) {
          // Rollback
          get().removeMessageFromConversation(conversationId, tempId);
          toast.error("Failed to send message. Please try again.");
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
        const { user } = useAuthStore.getState();
        const currentUserId = user?._id ?? "";

        // Optimistic update: toggle the reaction immediately
        const prevItems = get().messages[conversationId]?.items ?? [];
        const prevMessage = prevItems.find((m) => m._id === messageId);
        if (prevMessage) {
          const existingIdx = (prevMessage.reactions ?? []).findIndex(
            (r) => r.userId === currentUserId && r.emoji === emoji,
          );
          let optimisticReactions;
          if (existingIdx > -1) {
            // Toggle off
            optimisticReactions = [...(prevMessage.reactions ?? [])].filter(
              (_, i) => i !== existingIdx,
            );
          } else {
            // Toggle on (replace any existing reaction from this user)
            const filtered = (prevMessage.reactions ?? []).filter(
              (r) => r.userId !== currentUserId,
            );
            optimisticReactions = [...filtered, { userId: currentUserId, emoji }];
          }
          get().updateMessage(conversationId, messageId, {
            reactions: optimisticReactions,
          });
        }

        try {
          const res = await chatService.reactToMessage(messageId, emoji);

          // Backend may return either { message: {...} } or the message object directly.
          const reactions = res?.message?.reactions ?? res?.reactions;
          if (!Array.isArray(reactions)) {
            throw new TypeError("Invalid reactToMessage response payload");
          }

          // Reconcile with server canonical state
          get().updateMessage(conversationId, messageId, { reactions });
        } catch (error) {
          // Rollback to previous reactions on failure
          if (prevMessage) {
            get().updateMessage(conversationId, messageId, {
              reactions: prevMessage.reactions ?? [],
            });
          }
          console.error("Reaction error:", error);
        }
      },
      unsendMessage: async (conversationId, messageId) => {
        const mutationKey = `unsend:${conversationId}:${messageId}`;
        const mutationVersion = startMessageMutation(mutationKey);
        const previousMessage =
          get().messages[conversationId]?.items.find(
            (messageItem) => messageItem._id === messageId,
          ) ?? null;

        if (!previousMessage) {
          return;
        }

        get().updateMessage(conversationId, messageId, {
          isDeleted: true,
          content: "This message was removed",
          imgUrl: null,
          replyTo: null,
          reactions: [],
          readBy: [],
          editedAt: new Date().toISOString(),
        });

        try {
          const result = await chatService.unsendMessage(messageId);

          if (result?.message?._id) {
            get().updateMessage(conversationId, messageId, {
              isDeleted: Boolean(result.message.isDeleted),
              content: result.message.content ?? "",
              imgUrl: result.message.imgUrl ?? null,
              replyTo: result.message.replyTo ?? null,
              reactions: result.message.reactions ?? [],
              readBy: result.message.readBy ?? [],
              editedAt: result.message.editedAt ?? null,
            });
          }

          if (result?.conversation?._id) {
            get().updateConversation(
              result.conversation as Partial<Conversation> & { _id: string },
            );
          }
        } catch (error) {
          if (!isLatestMessageMutation(mutationKey, mutationVersion)) {
            throw error;
          }

          const latestMessage =
            get().messages[conversationId]?.items.find(
              (messageItem) => messageItem._id === messageId,
            ) ?? null;

          // If another canonical update already marked this message deleted,
          // do not rollback to stale content.
          const alreadyCanonicallyDeleted = Boolean(
            latestMessage?.isDeleted &&
              latestMessage?.imgUrl == null &&
              String(latestMessage?.content ?? "")
                .toLowerCase()
                .includes("removed"),
          );

          if (alreadyCanonicallyDeleted) {
            throw error;
          }

          get().updateMessage(conversationId, messageId, {
            isDeleted: previousMessage.isDeleted ?? false,
            content: previousMessage.content,
            imgUrl: previousMessage.imgUrl ?? null,
            replyTo: previousMessage.replyTo ?? null,
            reactions: previousMessage.reactions ?? [],
            readBy: previousMessage.readBy ?? [],
            editedAt: previousMessage.editedAt ?? null,
          });
          toast.error("Could not remove message for everyone. Restored.");
          console.error("Unsend error:", error);
          throw error;
        } finally {
          clearMessageMutation(mutationKey, mutationVersion);
        }
      },
      removeMessageForMe: async (conversationId, messageId) => {
        const previousItems = get().messages[conversationId]?.items ?? [];
        const hasTargetMessage = previousItems.some(
          (messageItem) => messageItem._id === messageId,
        );

        if (!hasTargetMessage) {
          return;
        }

        get().removeMessageFromConversation(conversationId, messageId);

        try {
          await chatService.removeMessageForMe(messageId);
        } catch (error) {
          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: {
                ...state.messages[conversationId],
                items: previousItems,
              },
            },
          }));
          toast.error("Could not remove message. Restored.");
          console.error("Remove-for-me error:", error);
          throw error;
        }
      },
      editMessage: async (conversationId, messageId, content) => {
        const mutationKey = `edit:${conversationId}:${messageId}`;
        const mutationVersion = startMessageMutation(mutationKey);
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
          const result = await chatService.editMessage(
            messageId,
            normalizedContent,
          );

          get().updateMessage(conversationId, messageId, {
            content: result?.message?.content ?? normalizedContent,
            editedAt: result?.message?.editedAt ?? optimisticEditedAt,
          });

          if (result?.conversation?._id) {
            get().updateConversation(
              result.conversation as Partial<Conversation> & { _id: string },
            );
          }
        } catch (error) {
          if (!isLatestMessageMutation(mutationKey, mutationVersion)) {
            throw error;
          }

          const latestMessage =
            get().messages[conversationId]?.items.find(
              (messageItem) => messageItem._id === messageId,
            ) ?? null;

          const latestEditedTs = toTimestamp(latestMessage?.editedAt || undefined);
          const optimisticEditedTsValue = toTimestamp(optimisticEditedAt);

          // If a newer update has landed (typically from socket canonical event),
          // skip rollback to avoid restoring stale text.
          if (latestEditedTs > optimisticEditedTsValue) {
            throw error;
          }

          get().updateMessage(conversationId, messageId, {
            content: previousContent,
            editedAt: previousEditedAt,
          });
          console.error("Edit error:", error);
          throw error;
        } finally {
          clearMessageMutation(mutationKey, mutationVersion);
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

          // Optimistic update
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

          await chatService.markAsSeen(activeConversationId);
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
          const conversation = await chatService.createConversation(
            type,
            name,
            memberIds,
          );

          if (!conversation?._id) {
            console.error(
              "[useChatStore] Invalid conversation response:",
              conversation,
            );
            return false;
          }

          get().addConvo(conversation, { setActive: true });
          get().setActiveConversation(conversation._id);

          // Join socket room
          const socket = useSocketStore.getState().socket;
          if (socket?.connected) {
            socket.emit("join-conversation", conversation._id);
          }

          return true;
        } catch (error) {
          console.error("[useChatStore] Error creating conversation:", error);
          return false;
        } finally {
          set({ loading: false });
        }
      },
      deleteConversation: async (conversationId) => {
        // Optimistic: remove from UI immediately
        const previousConversations = get().conversations;
        const previousActiveId = get().activeConversationId;

        set((state) => ({
          conversations: state.conversations.filter(
            (c) => c._id !== conversationId,
          ),
          activeConversationId:
            state.activeConversationId === conversationId
              ? null
              : state.activeConversationId,
        }));

        try {
          set({ loading: true });
          await chatService.deleteConversation(conversationId);
          return true;
        } catch (error) {
          // Rollback on failure
          set({
            conversations: previousConversations,
            activeConversationId: previousActiveId,
          });
          toast.error("Failed to delete conversation. Please try again.");
          console.error("[useChatStore] Error deleting conversation:", error);
          return false;
        } finally {
          set({ loading: false });
        }
      },
    }),
    {
      name: "chat-storage",
      // Only persist the active conversation ID to restore focus on reload.
      // Conversations list is always fetched fresh from the server to avoid stale data.
      partialize: (state) => ({ activeConversationId: state.activeConversationId }),
    },
  ),
);
