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

          // Reset reply context so user doesn't get stuck with stale reply preview
          set({ replyingTo: null });

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
          // Reset reply context so user doesn't get stuck with stale reply preview
          set({ replyingTo: null });
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
            let currentItems = state.messages[convoId]?.items ?? [];
            if (currentItems.some((m) => m._id === message._id)) {
              return state;
            }

            // Defend against Socket/API race condition where socket broadcasts the real message
            // before our local API call resolves and tears down the optimistic (temp-) message.
            if (message.isOwn && !message._id.startsWith("temp-")) {
              const matchedTempIndex = currentItems.findIndex(
                (m) =>
                  m.isOwn &&
                  String(m._id).startsWith("temp-") &&
                  m.content === message.content
              );

              if (matchedTempIndex !== -1) {
                // If we found the phantom optimistic message, destroy it early
                currentItems = currentItems.filter((_, idx) => idx !== matchedTempIndex);
              }
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
        set((state) => {
          const nextList = state.conversations.map((c) =>
            c._id === conversation._id ? { ...c, ...conversation } : c,
          );

          // Sort conversations chronologically so the latest updated conversation bubbles to the top
          nextList.sort((a, b) => {
            const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return timeB - timeA;
          });

          return { conversations: nextList };
        });
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
      setGroupAnnouncementMode: async (conversationId, enabled) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return false;
        }

        get().updateConversation({
          _id: conversationId,
          group: {
            ...previousConversation.group,
            announcementOnly: enabled,
          },
        });

        try {
          const updatedConversation = await chatService.updateGroupAnnouncementMode(
            conversationId,
            enabled,
          );

          if (updatedConversation?._id) {
            get().updateConversation(
              updatedConversation as Partial<Conversation> & { _id: string },
            );
          }

          return true;
        } catch (error) {
          get().updateConversation(previousConversation);
          console.error("Failed to update announcement mode", error);
          return false;
        }
      },
      setGroupAdminRole: async (conversationId, memberId, makeAdmin) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return false;
        }

        const adminIds = new Set(
          (previousConversation.group.adminIds || []).map(String),
        );

        if (makeAdmin) {
          adminIds.add(String(memberId));
        } else {
          adminIds.delete(String(memberId));
        }

        get().updateConversation({
          _id: conversationId,
          group: {
            ...previousConversation.group,
            adminIds: Array.from(adminIds),
          },
        });

        try {
          const updatedConversation = await chatService.updateGroupAdminRole(
            conversationId,
            memberId,
            makeAdmin,
          );

          if (updatedConversation?._id) {
            get().updateConversation(
              updatedConversation as Partial<Conversation> & { _id: string },
            );
          }

          return true;
        } catch (error) {
          get().updateConversation(previousConversation);
          console.error("Failed to update group admin role", error);
          return false;
        }
      },
      createGroupJoinLink: async (conversationId, expiresInHours = 24) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return {
            ok: false,
            message: "Join link is available for group conversations only",
          };
        }

        try {
          const result = await chatService.createGroupJoinLink(
            conversationId,
            expiresInHours,
          );

          if (result?.conversation?._id) {
            get().updateConversation(
              result.conversation as Partial<Conversation> & { _id: string },
            );
          }

          return {
            ok: true,
            joinLinkUrl: result.joinLink?.url,
            expiresAt: result.joinLink?.expiresAt,
          };
        } catch (error: unknown) {
          console.error("Failed to create group join link", error);
          const apiMessage =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
              "string"
              ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
              : null;

          return {
            ok: false,
            message: apiMessage || "Failed to create join link",
          };
        }
      },
      revokeGroupJoinLink: async (conversationId) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return false;
        }

        get().updateConversation({
          _id: conversationId,
          group: {
            ...previousConversation.group,
            joinLink: null,
          },
        });

        try {
          const updatedConversation = await chatService.revokeGroupJoinLink(
            conversationId,
          );

          if (updatedConversation?._id) {
            get().updateConversation(
              updatedConversation as Partial<Conversation> & { _id: string },
            );
          }

          return true;
        } catch (error) {
          get().updateConversation(previousConversation);
          console.error("Failed to revoke group join link", error);
          return false;
        }
      },
      joinGroupByLink: async (conversationId, token) => {
        try {
          const result = await chatService.joinGroupByLink(conversationId, token);
          const joinedConversation = result?.conversation;

          if (joinedConversation?._id) {
            const conversationExists = get().conversations.some(
              (conversationItem) =>
                conversationItem._id === joinedConversation._id,
            );

            if (conversationExists) {
              get().updateConversation(joinedConversation);
            } else {
              get().addConvo(joinedConversation, { setActive: false });
            }

            get().setActiveConversation(joinedConversation._id);

            const socket = useSocketStore.getState().socket;
            if (socket?.connected) {
              socket.emit("join-conversation", joinedConversation._id);
            }
          }

          return {
            ok: true,
            alreadyJoined: Boolean(result?.alreadyJoined),
          };
        } catch (error: unknown) {
          console.error("Failed to join group by link", error);
          const apiMessage =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
              "string"
              ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
              : null;

          return {
            ok: false,
            message: apiMessage || "Failed to join group",
          };
        }
      },
      pinGroupMessage: async (conversationId, messageId) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return false;
        }

        const targetMessage = messageId
          ? get().messages[conversationId]?.items.find(
              (messageItem) => messageItem._id === messageId,
            )
          : null;

        const currentUserId = String(useAuthStore.getState().user?._id || "");

        get().updateConversation({
          _id: conversationId,
          pinnedMessage: targetMessage
            ? {
                _id: targetMessage._id,
                content: targetMessage.content || null,
                imgUrl: targetMessage.imgUrl || null,
                senderId: String(targetMessage.senderId),
                createdAt: targetMessage.createdAt,
                pinnedAt: new Date().toISOString(),
                pinnedBy: currentUserId || null,
              }
            : null,
        });

        try {
          const updatedConversation = await chatService.pinGroupMessage(
            conversationId,
            messageId,
          );

          if (updatedConversation?._id) {
            get().updateConversation(
              updatedConversation as Partial<Conversation> & { _id: string },
            );
          }

          return true;
        } catch (error) {
          get().updateConversation(previousConversation);
          console.error("Failed to update pinned message", error);
          return false;
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
      forwardMessage: async (messageId, recipientIds, groupIds) => {
        try {
          const result = await chatService.forwardMessage(
            messageId,
            recipientIds,
            groupIds,
          );
          return { ok: true, message: result.message };
        } catch (error: unknown) {
          const apiMessage =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message === "string"
              ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
              : null;

          return {
            ok: false,
            message: apiMessage || "Failed to forward message",
          };
        }
      },
      toggleMessageForwardable: async (messageId, isForwardable) => {
        try {
          await chatService.toggleMessageForwardable(messageId, isForwardable);
          // Optional: Update local store for the message to reflect the new state instantly.
          // Since we don't know the conversationId here easily, we could just rely on socket
          // or user refresh. For a better UX, we could try to find and update it.
          return { ok: true };
        } catch (error) {
          console.error("Failed to toggle forwardable state:", error);
          return { ok: false };
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
