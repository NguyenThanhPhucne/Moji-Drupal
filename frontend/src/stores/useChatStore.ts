import { chatService } from "@/services/chatService";
import type { Conversation, Message, ConversationResponse } from "@/types/chat";
import type { ChatState, OutgoingMessageQueueItem } from "@/types/store";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useAuthStore } from "./useAuthStore";
import { useSocketStore } from "./useSocketStore";
import { toast } from "sonner";
import { handleRateLimitError } from "@/lib/rateLimitFeedback";
import {
  clearRealtimeScopedCaches,
  getCachedConversationList,
  setCachedConversationList,
  getPersistedConversationMeta,
} from "@/lib/scopedCache";

const buildTempDirectConversationId = (recipientId: string) => {
  return `temp-direct-${String(recipientId)}`;
};

const UNDO_SEND_WINDOW_SECONDS = 7;
const UNDO_SEND_WINDOW_MS = UNDO_SEND_WINDOW_SECONDS * 1000;
const DEFAULT_GROUP_CHANNEL_ID = "general";
const MAX_OUTGOING_QUEUE_ITEMS = 120;

const syncConversationListCacheForCurrentUser = () => {
  const currentUserId = String(useAuthStore.getState().user?._id || "").trim();
  if (!currentUserId) {
    return;
  }

  setCachedConversationList(currentUserId, useChatStore.getState().conversations);
};

const buildTempMessageId = () => {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const toSafeScalarString = (value: unknown) => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return "";
};

const isNavigatorOffline = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return navigator.onLine === false;
};

const extractErrorCode = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code?: string }).code || "";
  }

  return "";
};

const isLikelyOfflineError = (error: unknown) => {
  if (isNavigatorOffline()) {
    return true;
  }

  const code = extractErrorCode(error);
  if (code === "ERR_NETWORK") {
    return true;
  }

  const message = [
    extractApiErrorMessage(error),
    typeof error === "object" && error !== null && "message" in error
      ? toSafeScalarString((error as { message?: unknown }).message)
      : "",
  ]
    .join(" ")
    .trim();

  return /(network error|offline|failed to fetch|network request failed|ecconn|enotfound)/i.test(
    message,
  );
};

const resolveDeliveryErrorMessage = (error: unknown) => {
  return extractApiErrorMessage(error) || "Failed to send. Tap retry.";
};

const isTempMessageId = (value: unknown) => {
  return typeof value === "string" && value.startsWith("temp-");
};

const upsertOutgoingQueueItem = (
  queue: OutgoingMessageQueueItem[],
  nextItem: OutgoingMessageQueueItem,
) => {
  const withoutCurrent = queue.filter((item) => item.tempId !== nextItem.tempId);
  return [...withoutCurrent, nextItem].slice(-MAX_OUTGOING_QUEUE_ITEMS);
};

const removeOutgoingQueueItem = (
  queue: OutgoingMessageQueueItem[],
  tempId: string,
) => {
  return queue.filter((item) => item.tempId !== tempId);
};

const enqueueDirectOutgoingMessage = ({
  set,
  tempId,
  conversationId,
  recipientId,
  content,
  imgUrl,
  replyTo,
  queuedAt,
  attemptCount,
}: {
  set: typeof useChatStore.setState;
  tempId: string;
  conversationId: string;
  recipientId: string;
  content: string;
  imgUrl?: string;
  replyTo?: string;
  queuedAt: string;
  attemptCount: number;
}) => {
  set((state) => ({
    outgoingQueue: upsertOutgoingQueueItem(state.outgoingQueue, {
      tempId,
      scope: "direct",
      conversationId,
      recipientId,
      content,
      imgUrl,
      replyTo,
      queuedAt,
      attemptCount,
    }),
  }));
};

const finalizeDirectSendSuccess = ({
  set,
  get,
  deliveredMessage,
  tempId,
  optimisticConversationId,
  conversationIdOverride,
  activeConversationId,
  createdTempConversation,
}: {
  set: typeof useChatStore.setState;
  get: typeof useChatStore.getState;
  deliveredMessage: Message;
  tempId: string;
  optimisticConversationId: string;
  conversationIdOverride?: string;
  activeConversationId: string | null;
  createdTempConversation: boolean;
}) => {
  unregisterPendingOwnTempMessage({
    conversationId: optimisticConversationId,
    tempId,
  });

  set((state) => ({
    outgoingQueue: removeOutgoingQueueItem(state.outgoingQueue, tempId),
  }));

  get().removeMessageFromConversation(optimisticConversationId, tempId);

  const realConvoId = String(
    deliveredMessage.conversationId || conversationIdOverride || activeConversationId || "",
  ).trim();

  if (realConvoId && optimisticConversationId !== realConvoId) {
    pruneTempConversationState({
      optimisticConversationId,
      fallbackActiveConversationId: realConvoId,
      setState: set,
    });
  }

  get().addMessage(deliveredMessage);

  if (realConvoId) {
    set((state) => ({
      conversations: state.conversations.map((conversationItem) =>
        conversationItem._id === realConvoId
          ? { ...conversationItem, seenBy: [] }
          : conversationItem,
      ),
    }));
  }

  if (createdTempConversation) {
    get().fetchConversations().catch((error) => {
      console.error("Error refreshing conversations", error);
    });
  }

  const undoConversationId = String(
    realConvoId || deliveredMessage.conversationId || optimisticConversationId,
  ).trim();
  const undoMessageId = String(deliveredMessage._id || "").trim();

  showUndoSendToast({
    conversationId: undoConversationId,
    messageId: undoMessageId,
    onUndo: () => {
      void get()
        .unsendMessage(undoConversationId, undoMessageId, "undo")
        .catch((undoError) => {
          console.error("Undo send failed", undoError);
        });
    },
  });
};

const applyDirectSendFailure = ({
  set,
  get,
  error,
  tempId,
  optimisticConversationId,
  optimisticMessage,
  recipientId,
  content,
  imgUrl,
  replyTo,
  queuedAt,
}: {
  set: typeof useChatStore.setState;
  get: typeof useChatStore.getState;
  error: unknown;
  tempId: string;
  optimisticConversationId: string;
  optimisticMessage: Message;
  recipientId: string;
  content: string;
  imgUrl?: string;
  replyTo?: string;
  queuedAt: string;
}) => {
  const offlineFailure = isLikelyOfflineError(error);
  const nextAttemptCount = Number(optimisticMessage.deliveryAttemptCount || 0) + 1;

  get().updateMessage(optimisticConversationId, tempId, {
    deliveryState: offlineFailure ? "queued" : "failed",
    deliveryError: offlineFailure ? null : resolveDeliveryErrorMessage(error),
    deliveryAttemptCount: nextAttemptCount,
  });

  if (offlineFailure) {
    enqueueDirectOutgoingMessage({
      set,
      tempId,
      conversationId: optimisticConversationId,
      recipientId: String(recipientId || "").trim(),
      content: String(content || ""),
      imgUrl,
      replyTo,
      queuedAt,
      attemptCount: nextAttemptCount,
    });
    toast.info("Connection lost. Message moved to queue.");
  } else {
    set((state) => ({
      outgoingQueue: removeOutgoingQueueItem(state.outgoingQueue, tempId),
    }));

    const rateLimit = handleRateLimitError(error, {
      fallbackScope: "message:direct",
      actionLabel: "Sending messages too fast",
    });
    if (!rateLimit.handled) {
      toast.error(resolveDeliveryErrorMessage(error));
    }
  }

  set({ replyingTo: null });
};

const normalizeGroupChannelId = (channelId?: string | null) => {
  const normalized = String(channelId || "")
    .trim()
    .toLowerCase();

  return normalized || DEFAULT_GROUP_CHANNEL_ID;
};

const resolveConversationActiveGroupChannelId = (
  conversation?: Conversation | null,
) => {
  if (conversation?.type !== "group") {
    return null;
  }

  const channels = Array.isArray(conversation.group?.channels)
    ? conversation.group.channels
    : [];

  const activeCandidate = normalizeGroupChannelId(
    conversation.group?.activeChannelId,
  );

  if (channels.some((channel) => normalizeGroupChannelId(channel.channelId) === activeCandidate)) {
    return activeCandidate;
  }

  if (channels.length > 0) {
    return normalizeGroupChannelId(channels[0].channelId);
  }

  return DEFAULT_GROUP_CHANNEL_ID;
};

const resolveMessageGroupChannelId = (message: { groupChannelId?: string | null }) => {
  return normalizeGroupChannelId(message.groupChannelId);
};

const resolveDirectRecipientId = ({
  conversations,
  conversationId,
  fallbackRecipientId,
  currentUserId,
}: {
  conversations: Conversation[];
  conversationId: string;
  fallbackRecipientId?: string;
  currentUserId: string;
}) => {
  const normalizedFallback = String(fallbackRecipientId || "").trim();
  if (normalizedFallback) {
    return normalizedFallback;
  }

  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return "";
  }

  if (normalizedConversationId.startsWith("temp-direct-")) {
    return normalizedConversationId.replace("temp-direct-", "");
  }

  const conversation = conversations.find(
    (conversationItem) => String(conversationItem._id) === normalizedConversationId,
  );
  if (!conversation) {
    return "";
  }

  const recipient = conversation.participants.find(
    (participant) => String(participant._id) !== String(currentUserId),
  );

  return String(recipient?._id || "").trim();
};

const extractApiErrorMessage = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response
      ?.data?.message === "string"
  ) {
    return (error as { response?: { data?: { message?: string } } }).response
      ?.data?.message;
  }

  return null;
};

const notifyUnsendFailure = (mode: "standard" | "undo", error: unknown) => {
  if (mode === "undo") {
    toast.error(extractApiErrorMessage(error) || "Undo window expired.");
    return;
  }

  toast.error("Could not remove message for everyone. Restored.");
};

const showUndoSendToast = ({
  conversationId,
  messageId,
  onUndo,
}: {
  conversationId: string;
  messageId: string;
  onUndo: () => void;
}) => {
  const normalizedConversationId = String(conversationId || "").trim();
  const normalizedMessageId = String(messageId || "").trim();

  if (!normalizedConversationId || !normalizedMessageId) {
    return;
  }

  toast.success("Message sent", {
    id: `undo-send:${normalizedConversationId}:${normalizedMessageId}`,
    duration: UNDO_SEND_WINDOW_MS,
    description: `Undo available for ${UNDO_SEND_WINDOW_SECONDS}s.`,
    action: {
      label: "Undo",
      onClick: onUndo,
    },
  });
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

type PendingOwnTempMessageEntry = {
  tempId: string;
  content: string;
  replyToId: string;
  hasImage: boolean;
};

const pendingOwnTempMessagesByConversation = new Map<
  string,
  PendingOwnTempMessageEntry[]
>();

const normalizePendingOwnMessageDescriptor = ({
  content,
  replyToId,
  hasImage,
}: {
  content?: string | null;
  replyToId?: string | null;
  hasImage?: boolean;
}) => {
  return {
    content: String(content || "").trim(),
    replyToId: String(replyToId || "").trim(),
    hasImage: Boolean(hasImage),
  };
};

const resolveReplyToId = (replyTo: unknown) => {
  if (!replyTo) {
    return "";
  }

  if (typeof replyTo === "string") {
    return String(replyTo).trim();
  }

  if (typeof replyTo === "object") {
    const replyRecord = replyTo as { _id?: string | number };
    return String(replyRecord._id || "").trim();
  }

  return "";
};

const registerPendingOwnTempMessage = ({
  conversationId,
  tempId,
  content,
  replyToId,
  hasImage,
}: {
  conversationId: string;
  tempId: string;
  content?: string | null;
  replyToId?: string | null;
  hasImage?: boolean;
}) => {
  const normalizedConversationId = String(conversationId || "").trim();
  const normalizedTempId = String(tempId || "").trim();
  if (!normalizedConversationId || !normalizedTempId) {
    return;
  }

  const queue = pendingOwnTempMessagesByConversation.get(normalizedConversationId) || [];
  queue.push({
    tempId: normalizedTempId,
    ...normalizePendingOwnMessageDescriptor({
      content,
      replyToId,
      hasImage,
    }),
  });
  pendingOwnTempMessagesByConversation.set(normalizedConversationId, queue);
};

const unregisterPendingOwnTempMessage = ({
  conversationId,
  tempId,
}: {
  conversationId: string;
  tempId: string;
}) => {
  const normalizedConversationId = String(conversationId || "").trim();
  const normalizedTempId = String(tempId || "").trim();
  if (!normalizedConversationId || !normalizedTempId) {
    return;
  }

  const queue = pendingOwnTempMessagesByConversation.get(normalizedConversationId);
  if (!queue?.length) {
    return;
  }

  const nextQueue = queue.filter((entry) => entry.tempId !== normalizedTempId);
  if (!nextQueue.length) {
    pendingOwnTempMessagesByConversation.delete(normalizedConversationId);
    return;
  }

  pendingOwnTempMessagesByConversation.set(normalizedConversationId, nextQueue);
};

const consumeMatchingPendingOwnTempMessage = ({
  conversationId,
  content,
  replyToId,
  hasImage,
}: {
  conversationId: string;
  content?: string | null;
  replyToId?: string | null;
  hasImage?: boolean;
}) => {
  const normalizedConversationId = String(conversationId || "").trim();
  if (!normalizedConversationId) {
    return null;
  }

  const queue = pendingOwnTempMessagesByConversation.get(normalizedConversationId);
  if (!queue?.length) {
    return null;
  }

  const normalizedDescriptor = normalizePendingOwnMessageDescriptor({
    content,
    replyToId,
    hasImage,
  });

  const matchedIndex = queue.findIndex((entry) => {
    return (
      entry.content === normalizedDescriptor.content &&
      entry.replyToId === normalizedDescriptor.replyToId &&
      entry.hasImage === normalizedDescriptor.hasImage
    );
  });

  const entryIndex = Math.max(0, matchedIndex);
  const [matchedEntry] = queue.splice(entryIndex, 1);

  if (queue.length > 0) {
    pendingOwnTempMessagesByConversation.set(normalizedConversationId, queue);
  } else {
    pendingOwnTempMessagesByConversation.delete(normalizedConversationId);
  }

  return matchedEntry?.tempId || null;
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
const messageMutationLocks = new Set<string>();

type ChatStoreDebugGlobal = typeof globalThis & {
  __MOJI_CHAT_DEBUG__?: boolean;
};

const isChatStoreMutationDebugEnabled = () => {
  if (!import.meta.env.DEV) {
    return false;
  }

  if (globalThis.window === undefined) {
    return false;
  }

  return (globalThis as ChatStoreDebugGlobal).__MOJI_CHAT_DEBUG__ === true;
};

export const __chatStoreMutationDebug = {
  snapshot: () => {
    if (!isChatStoreMutationDebugEnabled()) {
      return {
        locks: [],
        versions: {},
      };
    }

    return {
      locks: Array.from(messageMutationLocks),
      versions: Object.fromEntries(messageMutationVersions.entries()),
    };
  },
};

const acquireMessageMutationLock = (mutationKey: string) => {
  if (messageMutationLocks.has(mutationKey)) {
    return false;
  }

  messageMutationLocks.add(mutationKey);
  return true;
};

const releaseMessageMutationLock = (mutationKey: string) => {
  messageMutationLocks.delete(mutationKey);
};

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
      outgoingQueue: [],
      isFlushingOutgoingQueue: false,

      setReplyingTo: (message) => set({ replyingTo: message }),
      setActiveConversation: (id) => {
        set({ activeConversationId: id });

        const conversationId = String(id || "").trim();
        if (!conversationId) {
          return;
        }

        const preloadMessagesForActiveConversation = () => {
          const activeMessageBucket = get().messages?.[conversationId];
          if (activeMessageBucket?.items?.length) {
            return;
          }

          get()
            .fetchMessages(conversationId)
            .catch((error) => {
              console.error(
                "Error preloading messages for active conversation:",
                error,
              );
            });
        };

        const hasTargetConversation = get().conversations.some(
          (conversation) => String(conversation._id) === conversationId,
        );

        if (hasTargetConversation) {
          preloadMessagesForActiveConversation();
          return;
        }

        get()
          .fetchConversations()
          .then(() => {
            const syncedConversation = get().conversations.some(
              (conversation) => String(conversation._id) === conversationId,
            );

            if (!syncedConversation) {
              return;
            }

            preloadMessagesForActiveConversation();
          })
          .catch((error) => {
            console.error(
              "Error syncing conversations for active selection:",
              error,
            );
          });
      },
      reset: () => {
        pendingOwnTempMessagesByConversation.clear();
        clearRealtimeScopedCaches();

        set({
          conversations: [],
          messages: {},
          activeConversationId: null,
          convoLoading: false,
          messageLoading: false,
          loading: false,
          replyingTo: null,
          outgoingQueue: [],
          isFlushingOutgoingQueue: false,
        });
      },
      fetchConversations: async () => {
        const currentUserId = String(useAuthStore.getState().user?._id || "").trim();
        const cachedConversations = currentUserId
          ? getCachedConversationList(currentUserId)
          : null;

        if (cachedConversations) {
          set({ conversations: cachedConversations, convoLoading: false });

          // background revalidation using persisted meta
          (async () => {
            try {
              const persistedMeta = currentUserId ? getPersistedConversationMeta(currentUserId) : null;
              const res = await chatService.fetchConversations({
                ifNoneMatch: persistedMeta?.etag || null,
                ifModifiedSince: persistedMeta?.lastModified || null,
              });

              if ((res as any).notModified) {
                // nothing to do
                return;
              }

              const payload = res as ConversationResponse & { _etag?: string | null; _lastModified?: string | null };
              if (payload?.conversations) {
                set({ conversations: payload.conversations });
                if (currentUserId) {
                  setCachedConversationList(currentUserId, payload.conversations, {
                    etag: (payload as any)._etag || null,
                    lastModified: (payload as any)._lastModified || null,
                  });
                }
              }
            } catch (err) {
              // background revalidation failures are non-fatal
              console.debug("Background conversation revalidation failed:", err);
            }
          })();

          return;
        }

        set({ convoLoading: true });

        try {
          const res = await chatService.fetchConversations();
          const conversations = (res as ConversationResponse).conversations;
          set({ conversations });

          if (currentUserId) {
            const meta = (res as any)?._etag || null;
            const lastMod = (res as any)?._lastModified || null;
            setCachedConversationList(currentUserId, conversations, {
              etag: meta,
              lastModified: lastMod,
            });
          }
          return;
        } catch (error) {
          const status =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof (error as { response?: { status?: unknown } }).response?.status ===
              "number"
              ? Number((error as { response?: { status?: number } }).response?.status)
              : null;

          if (status === 401 || status === 403) {
            try {
              const { conversations } =
                await chatService.fetchConversationsWithCookieSession();
              set({ conversations });

              if (currentUserId) {
                setCachedConversationList(currentUserId, conversations);
              }
              return;
            } catch (cookieSessionError) {
              console.error(
                "Error fetching conversations with cookie session fallback:",
                cookieSessionError,
              );
            }
          }

          console.error("Error fetching conversations:", error);
        } finally {
          set({ convoLoading: false });
        }
      },
      fetchMessages: async (conversationId, channelId) => {
        const { activeConversationId, messages, conversations } = get();
        const { user } = useAuthStore.getState();

        const convoId = conversationId ?? activeConversationId;

        if (!convoId) return;

        const targetConversation = conversations.find(
          (conversationItem) => conversationItem._id === convoId,
        );

        const resolvedGroupChannelId =
          targetConversation?.type === "group"
            ? normalizeGroupChannelId(
                channelId || resolveConversationActiveGroupChannelId(targetConversation),
              )
            : null;

        const current = messages?.[convoId];
        const sameChannelBucket =
          (current?.channelId || null) === (resolvedGroupChannelId || null);
        let nextCursor: string | null = "";
        if (sameChannelBucket) {
          nextCursor =
            current?.nextCursor === undefined ? "" : current?.nextCursor;
        }

        if (nextCursor === null) return;

        set({ messageLoading: true });

        try {
          const { messages: fetched, cursor } = await chatService.fetchMessages(
            convoId,
            nextCursor,
            resolvedGroupChannelId || undefined,
          );

          const processed = fetched.map((m) => ({
            ...m,
            isOwn: m.senderId === user?._id,
          }));

          set((state) => {
            const prev = sameChannelBucket
              ? state.messages[convoId]?.items ?? []
              : [];
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
                  channelId: resolvedGroupChannelId || null,
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
      // NOSONAR
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
          String(content || "").trim() || (imgUrl ? "Photo attachment" : "New message");

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

        const normalizedOptimisticConversationId = String(
          optimisticConversationId || "",
        ).trim();
        if (!normalizedOptimisticConversationId) {
          return;
        }

        // Build an optimistic message to show immediately
        const tempId = buildTempMessageId();
        const shouldQueueImmediately = isNavigatorOffline();
        const optimisticMessage: Message = {
          _id: tempId,
          conversationId: normalizedOptimisticConversationId,
          senderId: user?._id ?? "",
          content: content ?? "",
          imgUrl: imgUrl ?? null,
          replyTo: replyTo
            ? { _id: replyTo, content: "", senderId: "" }
            : null,
          reactions: [],
          isDeleted: false,
          editedAt: null,
          readBy: [],
          hiddenFor: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          isOwn: true,
          deliveryState: shouldQueueImmediately ? "queued" : "sending",
          deliveryError: null,
          deliveryAttemptCount: shouldQueueImmediately ? 0 : 1,
        };

        get().addMessage(optimisticMessage);
        registerPendingOwnTempMessage({
          conversationId: normalizedOptimisticConversationId,
          tempId,
          content: optimisticMessage.content,
          replyToId: resolveReplyToId(optimisticMessage.replyTo),
          hasImage: Boolean(optimisticMessage.imgUrl),
        });

        if (shouldQueueImmediately) {
          enqueueDirectOutgoingMessage({
            set,
            tempId,
            conversationId: normalizedOptimisticConversationId,
            recipientId: String(recipientId || "").trim(),
            content: String(content || ""),
            imgUrl: imgUrl || undefined,
            replyTo: String(replyTo || "").trim() || undefined,
            queuedAt: nowIso,
            attemptCount: 0,
          });
          toast.info("You're offline. Message queued.");
          return;
        }

        try {
          const deliveredMessage = await chatService.sendDirectMessage(
            recipientId,
            content,
            imgUrl,
            resolvedConversationId ?? undefined,
            replyTo,
          );

          finalizeDirectSendSuccess({
            set,
            get,
            deliveredMessage,
            tempId,
            optimisticConversationId: normalizedOptimisticConversationId,
            conversationIdOverride,
            activeConversationId,
            createdTempConversation,
          });
        } catch (error) {
          applyDirectSendFailure({
            set,
            get,
            error,
            tempId,
            optimisticConversationId: normalizedOptimisticConversationId,
            optimisticMessage,
            recipientId,
            content: String(content || ""),
            imgUrl: imgUrl || undefined,
            replyTo: String(replyTo || "").trim() || undefined,
            queuedAt: nowIso,
          });

          console.error("Error sending direct message", error);
        }
      },
      sendGroupMessage: async (
        conversationId,
        content,
        imgUrl,
        replyTo,
        groupChannelId,
      ) => {
        const user = useAuthStore.getState().user;
        const conversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );
        const effectiveGroupChannelId =
          groupChannelId ||
          resolveConversationActiveGroupChannelId(conversation) ||
          DEFAULT_GROUP_CHANNEL_ID;
        const nowIso = new Date().toISOString();
        const shouldQueueImmediately = isNavigatorOffline();

        // Optimistic message
        const tempId = buildTempMessageId();
        const optimisticMessage: Message = {
          _id: tempId,
          conversationId,
          groupChannelId: effectiveGroupChannelId,
          senderId: user?._id ?? "",
          content: content ?? "",
          imgUrl: imgUrl ?? null,
          replyTo: replyTo
            ? { _id: replyTo, content: "", senderId: "" }
            : null,
          reactions: [],
          isDeleted: false,
          editedAt: null,
          readBy: [],
          hiddenFor: [],
          createdAt: nowIso,
          updatedAt: nowIso,
          isOwn: true,
          deliveryState: shouldQueueImmediately ? "queued" : "sending",
          deliveryError: null,
          deliveryAttemptCount: shouldQueueImmediately ? 0 : 1,
        };

        get().addMessage(optimisticMessage);
        registerPendingOwnTempMessage({
          conversationId,
          tempId,
          content: optimisticMessage.content,
          replyToId: resolveReplyToId(optimisticMessage.replyTo),
          hasImage: Boolean(optimisticMessage.imgUrl),
        });

        if (shouldQueueImmediately) {
          set((state) => ({
            outgoingQueue: upsertOutgoingQueueItem(state.outgoingQueue, {
              tempId,
              scope: "group",
              conversationId,
              groupChannelId: effectiveGroupChannelId,
              content: String(content || ""),
              imgUrl: imgUrl || undefined,
              replyTo: String(replyTo || "").trim() || undefined,
              queuedAt: nowIso,
              attemptCount: 0,
            }),
          }));
          toast.info("You're offline. Message queued.");
          return;
        }

        try {
          const { addMessage } = get();
          const message = await chatService.sendGroupMessage(
            conversationId,
            content,
            imgUrl,
            replyTo,
            effectiveGroupChannelId,
          );

          // Replace temp with real
          unregisterPendingOwnTempMessage({
            conversationId,
            tempId,
          });
          set((state) => ({
            outgoingQueue: removeOutgoingQueueItem(state.outgoingQueue, tempId),
          }));
          get().removeMessageFromConversation(conversationId, tempId);
          addMessage(message);

          set((state) => ({
            conversations: state.conversations.map((c) =>
              c._id === conversationId ? { ...c, seenBy: [] } : c,
            ),
          }));

          const undoMessageId = String(message._id || "").trim();
          showUndoSendToast({
            conversationId,
            messageId: undoMessageId,
            onUndo: () => {
              void get()
                .unsendMessage(conversationId, undoMessageId, "undo")
                .catch((undoError) => {
                  console.error("Undo send failed", undoError);
                });
            },
          });
        } catch (error) {
          const offlineFailure = isLikelyOfflineError(error);
          const nextAttemptCount =
            Number(optimisticMessage.deliveryAttemptCount || 0) + 1;

          get().updateMessage(conversationId, tempId, {
            deliveryState: offlineFailure ? "queued" : "failed",
            deliveryError: offlineFailure ? null : resolveDeliveryErrorMessage(error),
            deliveryAttemptCount: nextAttemptCount,
          });

          if (offlineFailure) {
            set((state) => ({
              outgoingQueue: upsertOutgoingQueueItem(state.outgoingQueue, {
                tempId,
                scope: "group",
                conversationId,
                groupChannelId: effectiveGroupChannelId,
                content: String(content || ""),
                imgUrl: imgUrl || undefined,
                replyTo: String(replyTo || "").trim() || undefined,
                queuedAt: nowIso,
                attemptCount: nextAttemptCount,
              }),
            }));
            toast.info("Connection lost. Message moved to queue.");
          } else {
            set((state) => ({
              outgoingQueue: removeOutgoingQueueItem(state.outgoingQueue, tempId),
            }));

            const rateLimit = handleRateLimitError(error, {
              fallbackScope: "message:group",
              actionLabel: "Sending messages too fast",
            });
            if (!rateLimit.handled) {
              toast.error(resolveDeliveryErrorMessage(error));
            }
          }

          // Reset reply context so user doesn't get stuck with stale reply preview
          set({ replyingTo: null });

          console.error("Error sending group message", error);
        }
      },
      addMessage: (message) => {
        try {
          const { user } = useAuthStore.getState();
          message.isOwn = message.senderId === user?._id;
          const convoId = message.conversationId;

          set((state) => {
            const conversation = state.conversations.find(
              (conversationItem) => conversationItem._id === convoId,
            );
            const loadedChannelId = state.messages[convoId]?.channelId || null;

            if (conversation?.type === "group" && loadedChannelId) {
              const incomingChannelId = resolveMessageGroupChannelId(message);
              if (incomingChannelId !== normalizeGroupChannelId(loadedChannelId)) {
                return state;
              }
            }

            let currentItems = state.messages[convoId]?.items ?? [];
            if (currentItems.some((m) => m._id === message._id)) {
              return state;
            }

            let matchedTempId: string | null = null;

            // Defend against Socket/API race condition where socket broadcasts the real message
            // before our local API call resolves and tears down the optimistic (temp-) message.
            if (message.isOwn && !String(message._id).startsWith("temp-")) {
              matchedTempId = consumeMatchingPendingOwnTempMessage({
                conversationId: convoId,
                content: String(message.content || ""),
                replyToId: resolveReplyToId(message.replyTo),
                hasImage: Boolean(message.imgUrl),
              });

              if (matchedTempId) {
                currentItems = currentItems.filter(
                  (existingMessage) =>
                    String(existingMessage._id) !== String(matchedTempId),
                );
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
              outgoingQueue: matchedTempId
                ? removeOutgoingQueueItem(state.outgoingQueue, matchedTempId)
                : state.outgoingQueue,
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
      retryMessageDelivery: async (conversationId, messageId) => { // NOSONAR
        const normalizedConversationId = String(conversationId || "").trim();
        const normalizedMessageId = String(messageId || "").trim();

        if (
          !normalizedConversationId ||
          !normalizedMessageId ||
          !isTempMessageId(normalizedMessageId)
        ) {
          return;
        }

        const stateSnapshot = get();
        const queuedItem = stateSnapshot.outgoingQueue.find(
          (item) => item.tempId === normalizedMessageId,
        );
        const queuedConversationId = String(
          queuedItem?.conversationId || normalizedConversationId,
        ).trim();
        const effectiveConversationId = queuedConversationId || normalizedConversationId;

        const messageBucket =
          stateSnapshot.messages[effectiveConversationId]?.items ||
          stateSnapshot.messages[normalizedConversationId]?.items ||
          [];
        const pendingMessage = messageBucket.find(
          (messageItem) => String(messageItem._id) === normalizedMessageId,
        );

        if (!pendingMessage) {
          set((state) => ({
            outgoingQueue: removeOutgoingQueueItem(
              state.outgoingQueue,
              normalizedMessageId,
            ),
          }));
          return;
        }

        const user = useAuthStore.getState().user;
        const currentUserId = String(user?._id || "").trim();
        const conversation = stateSnapshot.conversations.find(
          (conversationItem) =>
            String(conversationItem._id) === String(effectiveConversationId),
        );

        const inferredScope: OutgoingMessageQueueItem["scope"] =
          conversation?.type === "group" ? "group" : "direct";
        const scope = queuedItem?.scope || inferredScope;

        const payloadContent = String(
          pendingMessage.content ?? queuedItem?.content ?? "",
        );
        const payloadImgUrl = pendingMessage.imgUrl || queuedItem?.imgUrl || undefined;
        const payloadReplyTo =
          resolveReplyToId(pendingMessage.replyTo) || queuedItem?.replyTo || "";
        const nextAttemptCount =
          Number(
            pendingMessage.deliveryAttemptCount || queuedItem?.attemptCount || 0,
          ) + 1;
        const nowIso = new Date().toISOString();

        if (!payloadContent.trim() && !payloadImgUrl) {
          get().updateMessage(effectiveConversationId, normalizedMessageId, {
            deliveryState: "failed",
            deliveryError: "Message content is empty.",
            deliveryAttemptCount: nextAttemptCount,
          });
          set((state) => ({
            outgoingQueue: removeOutgoingQueueItem(
              state.outgoingQueue,
              normalizedMessageId,
            ),
          }));
          return;
        }

        const recipientId =
          scope === "direct"
            ? resolveDirectRecipientId({
                conversations: stateSnapshot.conversations,
                conversationId: effectiveConversationId,
                fallbackRecipientId: queuedItem?.recipientId,
                currentUserId,
              })
            : "";

        const targetGroupChannelId =
          scope === "group"
            ? normalizeGroupChannelId(
                queuedItem?.groupChannelId || pendingMessage.groupChannelId,
              )
            : null;

        if (scope === "direct" && !recipientId) {
          get().updateMessage(effectiveConversationId, normalizedMessageId, {
            deliveryState: "failed",
            deliveryError: "Recipient is no longer available.",
            deliveryAttemptCount: nextAttemptCount,
          });
          set((state) => ({
            outgoingQueue: removeOutgoingQueueItem(
              state.outgoingQueue,
              normalizedMessageId,
            ),
          }));
          return;
        }

        if (isNavigatorOffline()) {
          get().updateMessage(effectiveConversationId, normalizedMessageId, {
            deliveryState: "queued",
            deliveryError: null,
            deliveryAttemptCount: nextAttemptCount,
          });
          set((state) => ({
            outgoingQueue: upsertOutgoingQueueItem(state.outgoingQueue, {
              tempId: normalizedMessageId,
              scope,
              conversationId: effectiveConversationId,
              recipientId: scope === "direct" ? recipientId : undefined,
              groupChannelId: scope === "group" ? targetGroupChannelId || undefined : undefined,
              content: payloadContent,
              imgUrl: payloadImgUrl,
              replyTo: payloadReplyTo || undefined,
              queuedAt: nowIso,
              attemptCount: nextAttemptCount,
            }),
          }));
          return;
        }

        registerPendingOwnTempMessage({
          conversationId: effectiveConversationId,
          tempId: normalizedMessageId,
          content: payloadContent,
          replyToId: payloadReplyTo,
          hasImage: Boolean(payloadImgUrl),
        });

        get().updateMessage(effectiveConversationId, normalizedMessageId, {
          deliveryState: "sending",
          deliveryError: null,
          deliveryAttemptCount: nextAttemptCount,
        });

        set((state) => ({
          outgoingQueue: removeOutgoingQueueItem(
            state.outgoingQueue,
            normalizedMessageId,
          ),
        }));

        try {
          if (scope === "direct") {
            const resolvedConversationId = isPersistedConversationId(
              effectiveConversationId,
            )
              ? effectiveConversationId
              : undefined;

            const deliveredMessage = await chatService.sendDirectMessage(
              recipientId,
              payloadContent,
              payloadImgUrl,
              resolvedConversationId,
              payloadReplyTo || undefined,
            );

            unregisterPendingOwnTempMessage({
              conversationId: effectiveConversationId,
              tempId: normalizedMessageId,
            });
            get().removeMessageFromConversation(
              effectiveConversationId,
              normalizedMessageId,
            );

            const realConvoId = String(
              deliveredMessage.conversationId || effectiveConversationId,
            ).trim();

            if (realConvoId && realConvoId !== effectiveConversationId) {
              pruneTempConversationState({
                optimisticConversationId: effectiveConversationId,
                fallbackActiveConversationId: realConvoId,
                setState: set,
              });
            }

            get().addMessage(deliveredMessage);

            if (realConvoId) {
              set((state) => ({
                conversations: state.conversations.map((conversationItem) =>
                  conversationItem._id === realConvoId
                    ? { ...conversationItem, seenBy: [] }
                    : conversationItem,
                ),
              }));
            }
          } else {
            const deliveredMessage = await chatService.sendGroupMessage(
              effectiveConversationId,
              payloadContent,
              payloadImgUrl,
              payloadReplyTo || undefined,
              targetGroupChannelId || undefined,
            );

            unregisterPendingOwnTempMessage({
              conversationId: effectiveConversationId,
              tempId: normalizedMessageId,
            });
            get().removeMessageFromConversation(
              effectiveConversationId,
              normalizedMessageId,
            );
            get().addMessage(deliveredMessage);

            set((state) => ({
              conversations: state.conversations.map((conversationItem) =>
                conversationItem._id === effectiveConversationId
                  ? { ...conversationItem, seenBy: [] }
                  : conversationItem,
              ),
            }));
          }
        } catch (error) {
          const offlineFailure = isLikelyOfflineError(error);

          get().updateMessage(effectiveConversationId, normalizedMessageId, {
            deliveryState: offlineFailure ? "queued" : "failed",
            deliveryError: offlineFailure ? null : resolveDeliveryErrorMessage(error),
            deliveryAttemptCount: nextAttemptCount,
          });

          if (offlineFailure) {
            set((state) => ({
              outgoingQueue: upsertOutgoingQueueItem(state.outgoingQueue, {
                tempId: normalizedMessageId,
                scope,
                conversationId: effectiveConversationId,
                recipientId: scope === "direct" ? recipientId : undefined,
                groupChannelId:
                  scope === "group" ? targetGroupChannelId || undefined : undefined,
                content: payloadContent,
                imgUrl: payloadImgUrl,
                replyTo: payloadReplyTo || undefined,
                queuedAt: nowIso,
                attemptCount: nextAttemptCount,
              }),
            }));
            return;
          }

          const rateLimit = handleRateLimitError(error, {
            fallbackScope: scope === "direct" ? "message:direct" : "message:group",
            actionLabel: "Sending messages too fast",
          });
          if (!rateLimit.handled) {
            toast.error(resolveDeliveryErrorMessage(error));
          }

          console.error("Error retrying message delivery", error);
        }
      },
      flushOutgoingQueue: async () => {
        if (get().isFlushingOutgoingQueue || isNavigatorOffline()) {
          return;
        }

        const queueSnapshot = [...get().outgoingQueue];
        if (!queueSnapshot.length) {
          return;
        }

        set({ isFlushingOutgoingQueue: true });

        try {
          for (const queuedItem of queueSnapshot) {
            if (isNavigatorOffline()) {
              break;
            }

            const targetConversationId = String(
              queuedItem.conversationId || "",
            ).trim();
            const targetMessageId = String(queuedItem.tempId || "").trim();

            if (!targetConversationId || !targetMessageId) {
              continue;
            }

            await get().retryMessageDelivery(targetConversationId, targetMessageId);
          }
        } finally {
          set({ isFlushingOutgoingQueue: false });
        }
      },
      reactToMessage: async (conversationId, messageId, emoji) => {
        const mutationKey = `react:${conversationId}:${messageId}`;
        if (!acquireMessageMutationLock(mutationKey)) {
          return;
        }

        const mutationVersion = startMessageMutation(mutationKey);
        const { user } = useAuthStore.getState();
        const currentUserId = user?._id ?? "";

        // Optimistic update: toggle the reaction immediately
        const prevItems = get().messages[conversationId]?.items ?? [];
        const prevMessage = prevItems.find((m) => m._id === messageId);
        if (!prevMessage || prevMessage.isDeleted) {
          clearMessageMutation(mutationKey, mutationVersion);
          releaseMessageMutationLock(mutationKey);
          return;
        }

        const previousReactions = prevMessage.reactions ?? [];

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

          if (!isLatestMessageMutation(mutationKey, mutationVersion)) {
            return;
          }

          // Reconcile with server canonical state
          get().updateMessage(conversationId, messageId, { reactions });
        } catch (error) {
          if (!isLatestMessageMutation(mutationKey, mutationVersion)) {
            return;
          }

          // Rollback to previous reactions on failure
          get().updateMessage(conversationId, messageId, {
            reactions: previousReactions,
          });

          handleRateLimitError(error, {
            fallbackScope: "message:reaction",
            actionLabel: "Reacting too fast",
          });

          console.error("Reaction error:", error);
        } finally {
          clearMessageMutation(mutationKey, mutationVersion);
          releaseMessageMutationLock(mutationKey);
        }
      },
      unsendMessage: async (conversationId, messageId, mode = "standard") => {
        const mutationKey = `unsend:${conversationId}:${messageId}`;
        if (!acquireMessageMutationLock(mutationKey)) {
          return;
        }

        const mutationVersion = startMessageMutation(mutationKey);
        const previousMessage =
          get().messages[conversationId]?.items.find(
            (messageItem) => messageItem._id === messageId,
          ) ?? null;

        if (!previousMessage) {
          clearMessageMutation(mutationKey, mutationVersion);
          releaseMessageMutationLock(mutationKey);
          return;
        }

        const optimisticDeletedAt = new Date().toISOString();

        get().updateMessage(conversationId, messageId, {
          isDeleted: true,
          content: "This message was removed",
          imgUrl: null,
          replyTo: null,
          reactions: [],
          readBy: [],
          editedAt: optimisticDeletedAt,
        });

        try {
          const result =
            mode === "undo"
              ? await chatService.undoSendMessage(messageId)
              : await chatService.unsendMessage(messageId);

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
              {
                ...result.conversation,
                _id: result.conversation._id,
              },
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
          const latestEditedTs = toTimestamp(latestMessage?.editedAt || undefined);
          const optimisticDeletedTs = toTimestamp(optimisticDeletedAt);

          const alreadyCanonicallyDeleted = Boolean(
            latestMessage?.isDeleted &&
              latestMessage?.imgUrl == null &&
              String(latestMessage?.content ?? "")
                .toLowerCase()
                .includes("removed") &&
              latestEditedTs > optimisticDeletedTs,
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

          console.error("Unsend error:", error);
          throw error;
        } finally {
          clearMessageMutation(mutationKey, mutationVersion);
          releaseMessageMutationLock(mutationKey);
        }
      },
      removeMessageForMe: async (conversationId, messageId) => {
        const previousItems = get().messages[conversationId]?.items ?? [];
        const removedMessage =
          previousItems.find((messageItem) => messageItem._id === messageId) ?? null;

        if (!removedMessage) {
          return;
        }

        get().removeMessageFromConversation(conversationId, messageId);

        try {
          const removeResult = await chatService.removeMessageForMe(messageId);
          if (removeResult?.conversation?._id) {
            get().updateConversation(
              removeResult.conversation as Partial<Conversation> & { _id: string },
            );
          }
        } catch (error) {
          set((state) => {
            // Reinsert only the removed message so concurrent incoming updates are preserved.
            const currentBucket = state.messages[conversationId];
            const currentItems = currentBucket?.items ?? [];

            if (currentItems.some((messageItem) => messageItem._id === messageId)) {
              return state;
            }

            return {
              messages: {
                ...state.messages,
                [conversationId]: {
                  ...currentBucket,
                  items: sortMessagesChronologically([
                    ...currentItems,
                    removedMessage,
                  ]),
                },
              },
            };
          });
          console.error("Remove-for-me error:", error);
          throw error;
        }
      },
      editMessage: async (conversationId, messageId, content) => {
        const mutationKey = `edit:${conversationId}:${messageId}`;
        if (!acquireMessageMutationLock(mutationKey)) {
          return;
        }

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
              {
                ...result.conversation,
                _id: result.conversation._id,
              },
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
          releaseMessageMutationLock(mutationKey);
        }
      },

      updateConversation: (conversation) => {
        set((state) => {
          const nextList = state.conversations.map((c) => {
            if (c._id !== conversation._id) {
              return c;
            }

            return {
              ...c,
              ...conversation,
              ...(conversation.group
                ? {
                    group: {
                      ...c.group,
                      ...conversation.group,
                    },
                  }
                : {}),
            };
          });

          // Sort conversations chronologically so the latest updated conversation bubbles to the top
          nextList.sort((a, b) => {
            const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return timeB - timeA;
          });

          return { conversations: nextList };
        });

        syncConversationListCacheForCurrentUser();
      },
      markAsSeen: async () => {
        let rollbackState: {
          conversationId: string;
          userId: string;
          activeGroupChannelId: string | null;
          previousUnreadCount: number;
          previousActiveChannelUnreadCount: number;
          optimisticUnreadCount: number;
        } | null = null;

        try {
          const { user } = useAuthStore.getState();
          const { activeConversationId, conversations } = get();
          const normalizedUserId = String(user?._id || "");
          const normalizedActiveConversationId = String(
            activeConversationId || "",
          );

          if (!normalizedActiveConversationId || !normalizedUserId) {
            return;
          }

          const convo = conversations.find(
            (c) => String(c._id) === normalizedActiveConversationId,
          );

          if (!convo) {
            return;
          }

          const activeGroupChannelId =
            convo.type === "group"
              ? resolveConversationActiveGroupChannelId(convo)
              : null;
          const myChannelUnreadMap =
            convo.type === "group"
              ? convo.group?.channelUnreadCounts?.[normalizedUserId] || {}
              : {};
          const previousUnreadCount = Number(
            convo.unreadCounts?.[normalizedUserId] || 0,
          );
          const previousActiveChannelUnreadCount =
            convo.type === "group" && activeGroupChannelId
              ? Number(myChannelUnreadMap?.[activeGroupChannelId] || 0)
              : 0;
          const hasUnreadForActiveChannel =
            convo.type === "group" &&
            activeGroupChannelId &&
            previousActiveChannelUnreadCount > 0;

          if (
            previousUnreadCount === 0 &&
            !hasUnreadForActiveChannel
          ) {
            return;
          }

          const optimisticUnreadCount =
            convo.type === "group"
              ? Math.max(0, previousUnreadCount - previousActiveChannelUnreadCount)
              : 0;

          rollbackState = {
            conversationId: normalizedActiveConversationId,
            userId: normalizedUserId,
            activeGroupChannelId,
            previousUnreadCount,
            previousActiveChannelUnreadCount,
            optimisticUnreadCount,
          };

          // Optimistic update
          set((state) => ({
            conversations: state.conversations.map((c) =>
              String(c._id) !== normalizedActiveConversationId || !c.lastMessage
                ? c
                : {
                    ...c,
                    unreadCounts: {
                      ...c.unreadCounts,
                      [normalizedUserId]: optimisticUnreadCount,
                    },
                    ...(c.type === "group"
                      ? {
                          group: {
                            ...c.group,
                            channelUnreadCounts: {
                              ...c.group?.channelUnreadCounts,
                              [normalizedUserId]: {
                                ...c.group?.channelUnreadCounts?.[normalizedUserId],
                                ...(activeGroupChannelId
                                  ? { [activeGroupChannelId]: 0 }
                                  : {}),
                              },
                            },
                          },
                        }
                      : {}),
                  },
            ),
          }));

          await chatService.markAsSeen(
            normalizedActiveConversationId,
            activeGroupChannelId || undefined,
          );
        } catch (error) {
          if (rollbackState) {
            const rollbackSnapshot = rollbackState;
            set((state) => {
              const targetConversation = state.conversations.find(
                (conversationItem) =>
                  String(conversationItem._id) === rollbackSnapshot.conversationId,
              );

              if (!targetConversation) {
                return state;
              }

              const currentUnreadCount = Number(
                targetConversation.unreadCounts?.[rollbackSnapshot.userId] || 0,
              );
              if (currentUnreadCount !== rollbackSnapshot.optimisticUnreadCount) {
                return state;
              }

              if (
                targetConversation.type === "group" &&
                rollbackSnapshot.activeGroupChannelId
              ) {
                const currentChannelUnread = Number(
                  targetConversation.group?.channelUnreadCounts?.[
                    rollbackSnapshot.userId
                  ]?.[rollbackSnapshot.activeGroupChannelId] || 0,
                );

                if (currentChannelUnread !== 0) {
                  return state;
                }
              }

              return {
                conversations: state.conversations.map((conversationItem) => {
                  if (
                    String(conversationItem._id) !== rollbackSnapshot.conversationId
                  ) {
                    return conversationItem;
                  }

                  const restoredUnreadCounts = {
                    ...conversationItem.unreadCounts,
                    [rollbackSnapshot.userId]: rollbackSnapshot.previousUnreadCount,
                  };

                  if (
                    conversationItem.type !== "group" ||
                    !rollbackSnapshot.activeGroupChannelId
                  ) {
                    return {
                      ...conversationItem,
                      unreadCounts: restoredUnreadCounts,
                    };
                  }

                  const currentPerUserChannelUnread = {
                    ...conversationItem.group?.channelUnreadCounts?.[
                      rollbackSnapshot.userId
                    ],
                  };

                  if (rollbackSnapshot.previousActiveChannelUnreadCount > 0) {
                    currentPerUserChannelUnread[rollbackSnapshot.activeGroupChannelId] =
                      rollbackSnapshot.previousActiveChannelUnreadCount;
                  } else {
                    delete currentPerUserChannelUnread[rollbackSnapshot.activeGroupChannelId];
                  }

                  const restoredChannelUnreadCounts = {
                    ...conversationItem.group?.channelUnreadCounts,
                  };

                  if (Object.keys(currentPerUserChannelUnread).length > 0) {
                    restoredChannelUnreadCounts[rollbackSnapshot.userId] =
                      currentPerUserChannelUnread;
                  } else {
                    delete restoredChannelUnreadCounts[rollbackSnapshot.userId];
                  }

                  return {
                    ...conversationItem,
                    unreadCounts: restoredUnreadCounts,
                    group: {
                      ...conversationItem.group,
                      channelUnreadCounts: restoredChannelUnreadCounts,
                    },
              };
            });
          }

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

        syncConversationListCacheForCurrentUser();
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
              {
                ...updatedConversation,
                _id: updatedConversation._id,
              },
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
              {
                ...updatedConversation,
                _id: updatedConversation._id,
              },
            );
          }

          return true;
        } catch (error) {
          get().updateConversation(previousConversation);
          console.error("Failed to update group admin role", error);
          return false;
        }
      },
      createGroupChannel: async (
        conversationId,
        name,
        description,
        options,
      ) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return {
            ok: false,
            message: "Only group conversations support channels",
          };
        }

        const normalizedName = String(name || "")
          .replaceAll(/\s+/g, " ")
          .trim();

        if (normalizedName.length < 2 || normalizedName.length > 40) {
          return {
            ok: false,
            message: "Channel name must be 2-40 characters",
          };
        }

        try {
          const result = await chatService.createGroupChannel(conversationId, {
            name: normalizedName,
            description: String(description || "").trim(),
            categoryId: options?.categoryId ?? null,
            sendRoles: options?.sendRoles,
            position: options?.position,
          });

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: {
                items: [],
                hasMore: false,
                nextCursor: undefined,
                channelId:
                  result?.channel?.channelId ||
                  normalizeGroupChannelId(
                    result?.conversation?.group?.activeChannelId,
                  ),
              },
            },
          }));

          await get().fetchMessages(conversationId);

          return {
            ok: true,
          };
        } catch (error: unknown) {
          console.error("Failed to create group channel", error);

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
            message: apiMessage || "Failed to create group channel",
          };
        }
      },
      updateGroupChannel: async (conversationId, channelId, payload) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return {
            ok: false,
            message: "Only group conversations support channels",
          };
        }

        try {
          const result = await chatService.updateGroupChannel(
            conversationId,
            channelId,
            payload,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          return { ok: true };
        } catch (error: unknown) {
          const apiMessage = extractApiErrorMessage(error);

          return {
            ok: false,
            message: apiMessage || "Failed to update group channel",
          };
        }
      },
      deleteGroupChannel: async (conversationId, channelId) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return {
            ok: false,
            message: "Only group conversations support channels",
          };
        }

        try {
          const result = await chatService.deleteGroupChannel(
            conversationId,
            channelId,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          const refreshedConversation = get().conversations.find(
            (conversationItem) => conversationItem._id === conversationId,
          );
          const activeChannelId =
            resolveConversationActiveGroupChannelId(refreshedConversation) ||
            DEFAULT_GROUP_CHANNEL_ID;

          set((state) => ({
            messages: {
              ...state.messages,
              [conversationId]: {
                items: [],
                hasMore: false,
                nextCursor: undefined,
                channelId: activeChannelId,
              },
            },
          }));

          await get().fetchMessages(conversationId, activeChannelId);

          return { ok: true };
        } catch (error: unknown) {
          const apiMessage = extractApiErrorMessage(error);

          return {
            ok: false,
            message: apiMessage || "Failed to delete group channel",
          };
        }
      },
      reorderGroupChannels: async (conversationId, channelIds) => {
        try {
          const result = await chatService.reorderGroupChannels(
            conversationId,
            channelIds,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          return true;
        } catch (error) {
          console.error("Failed to reorder group channels", error);
          return false;
        }
      },
      createGroupChannelCategory: async (conversationId, name, position) => {
        const normalizedName = String(name || "")
          .replaceAll(/\s+/g, " ")
          .trim();

        if (normalizedName.length < 2 || normalizedName.length > 40) {
          return {
            ok: false,
            message: "Category name must be 2-40 characters",
          };
        }

        try {
          const result = await chatService.createGroupChannelCategory(
            conversationId,
            {
              name: normalizedName,
              position,
            },
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          return { ok: true };
        } catch (error: unknown) {
          const apiMessage = extractApiErrorMessage(error);
          return {
            ok: false,
            message: apiMessage || "Failed to create category",
          };
        }
      },
      updateGroupChannelCategory: async (conversationId, categoryId, payload) => {
        try {
          const result = await chatService.updateGroupChannelCategory(
            conversationId,
            categoryId,
            payload,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          return { ok: true };
        } catch (error: unknown) {
          const apiMessage = extractApiErrorMessage(error);
          return {
            ok: false,
            message: apiMessage || "Failed to update category",
          };
        }
      },
      deleteGroupChannelCategory: async (conversationId, categoryId) => {
        try {
          const result = await chatService.deleteGroupChannelCategory(
            conversationId,
            categoryId,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          return { ok: true };
        } catch (error: unknown) {
          const apiMessage = extractApiErrorMessage(error);
          return {
            ok: false,
            message: apiMessage || "Failed to delete category",
          };
        }
      },
      reorderGroupChannelCategories: async (conversationId, categoryIds) => {
        try {
          const result = await chatService.reorderGroupChannelCategories(
            conversationId,
            categoryIds,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          return true;
        } catch (error) {
          console.error("Failed to reorder channel categories", error);
          return false;
        }
      },
      fetchGroupChannelAnalytics: async (conversationId, days = 7) => {
        try {
          const result = await chatService.fetchGroupChannelAnalytics(
            conversationId,
            days,
          );

          return {
            ok: true,
            analytics: result.analytics,
          };
        } catch (error: unknown) {
          const apiMessage = extractApiErrorMessage(error);

          return {
            ok: false,
            message: apiMessage || "Failed to fetch channel analytics",
          };
        }
      },
      setGroupActiveChannel: async (conversationId, channelId) => {
        const previousConversation = get().conversations.find(
          (conversationItem) => conversationItem._id === conversationId,
        );

        if (previousConversation?.type !== "group") {
          return false;
        }

        const normalizedChannelId = normalizeGroupChannelId(channelId);
        const previousBucket = get().messages[conversationId];

        get().updateConversation({
          _id: conversationId,
          group: {
            ...previousConversation.group,
            activeChannelId: normalizedChannelId,
          },
        });

        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: {
              items: [],
              hasMore: false,
              nextCursor: undefined,
              channelId: normalizedChannelId,
            },
          },
        }));

        try {
          const result = await chatService.setGroupActiveChannel(
            conversationId,
            normalizedChannelId,
          );

          if (result?.conversation?._id) {
            get().updateConversation({
              ...result.conversation,
              _id: result.conversation._id,
            });
          }

          await get().fetchMessages(conversationId, normalizedChannelId);
          return true;
        } catch (error) {
          get().updateConversation(previousConversation);

          set((state) => {
            const nextMessages = { ...state.messages };

            if (previousBucket) {
              nextMessages[conversationId] = previousBucket;
            } else {
              delete nextMessages[conversationId];
            }

            return {
              messages: nextMessages,
            };
          });

          console.error("Failed to switch group channel", error);
          return false;
        }
      },
      createGroupJoinLink: async (conversationId, options) => {
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
          const expiresInHours =
            typeof options?.expiresInHours === "number"
              ? options.expiresInHours
              : 24;

          const result = await chatService.createGroupJoinLink(
            conversationId,
            {
              expiresInHours,
              maxUses: options?.maxUses ?? null,
              oneTime: Boolean(options?.oneTime),
            },
          );

          if (result?.conversation?._id) {
            get().updateConversation(
              {
                ...result.conversation,
                _id: result.conversation._id,
              },
            );
          }

          return {
            ok: true,
            joinLinkUrl: result.joinLink?.url,
            expiresAt: result.joinLink?.expiresAt,
            maxUses: result.joinLink?.maxUses ?? null,
            oneTime: Boolean(result.joinLink?.oneTime),
            remainingUses: result.joinLink?.remainingUses ?? null,
          };
        } catch (error: unknown) {
          console.error("Failed to create group join link", error);
          const rateLimit = handleRateLimitError(error, {
            fallbackScope: "chat:join-link",
            actionLabel: "Join link actions are cooling down",
          });

          const apiMessage =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
              "string"
              ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
              : null;

          if (rateLimit.handled) {
            return {
              ok: false,
              message:
                apiMessage ||
                `Please retry in ${rateLimit.info?.retryAfterSeconds || 1}s`,
              retryAfterSeconds: rateLimit.info?.retryAfterSeconds,
            };
          }

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
              {
                ...updatedConversation,
                _id: updatedConversation._id,
              },
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
          const rateLimit = handleRateLimitError(error, {
            fallbackScope: "chat:join-link",
            actionLabel: "Joining groups too fast",
          });

          const apiMessage =
            typeof error === "object" &&
            error !== null &&
            "response" in error &&
            typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
              "string"
              ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
              : null;

          if (rateLimit.handled) {
            return {
              ok: false,
              message:
                apiMessage ||
                `Please retry in ${rateLimit.info?.retryAfterSeconds || 1}s`,
              retryAfterSeconds: rateLimit.info?.retryAfterSeconds,
            };
          }

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
              {
                ...updatedConversation,
                _id: updatedConversation._id,
              },
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
        // Find the message across all loaded conversations to enable optimistic update.
        const { messages: allMessages, activeConversationId } = get();
        let targetConversationId: string | null = null;
        let previousIsForwardable: boolean | undefined;

        const conversationIds = activeConversationId
          ? [activeConversationId, ...Object.keys(allMessages).filter((id) => id !== activeConversationId)]
          : Object.keys(allMessages);

        for (const convoId of conversationIds) {
          const match = allMessages[convoId]?.items?.find(
            (m) => m._id === messageId,
          );
          if (match) {
            targetConversationId = convoId;
            previousIsForwardable = match.isForwardable;
            break;
          }
        }

        // Optimistic update
        if (targetConversationId) {
          get().updateMessage(targetConversationId, messageId, {
            isForwardable,
          });
        }

        try {
          await chatService.toggleMessageForwardable(messageId, isForwardable);
          return { ok: true };
        } catch (error) {
          // Rollback on failure
          if (targetConversationId && previousIsForwardable !== undefined) {
            get().updateMessage(targetConversationId, messageId, {
              isForwardable: previousIsForwardable,
            });
          }
          console.error("Failed to toggle forwardable state:", error);
          return { ok: false };
        }
      },
    }),
    {
      name: "chat-storage",
      // Persist lightweight client state only; conversation/message bodies remain server-driven.
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        outgoingQueue: state.outgoingQueue.slice(-MAX_OUTGOING_QUEUE_ITEMS),
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ChatState> | undefined) || {};

        return {
          ...currentState,
          ...persisted,
          // Keep a runtime-selected conversation when hydration finishes later.
          activeConversationId:
            currentState.activeConversationId || persisted.activeConversationId || null,
          outgoingQueue: Array.isArray(persisted.outgoingQueue)
            ? persisted.outgoingQueue
            : currentState.outgoingQueue,
        };
      },
    },
  ),
);
