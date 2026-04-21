import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useSocialStore } from "./useSocialStore";
import { toast } from "sonner";
import {
  isFeatureFlagEnabled,
  resolveFeatureFlags,
  sanitizeServerFeatureFlags,
  type AppFeatureFlagKey,
} from "@/lib/featureFlags";
import type { Conversation, Message } from "@/types/chat";
import type {
  SocialComment,
  SocialNotification,
  SocialPost,
  SocialReactionSummary,
  SocialReactionType,
  SocialUserLite,
} from "@/types/social";

const SOCIAL_BURST_DEBOUNCE_MS = 90;
const SOCKET_EVENT_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const SOCKET_EVENT_SCOPE_WINDOW_MS = 10 * 60 * 1000;
const MAX_QUEUED_REALTIME_DELTAS = 500;

let socialBurstTimer: ReturnType<typeof setTimeout> | null = null;

type SocketEventMeta = {
  eventId?: string;
  eventName?: string;
  eventTs?: string;
  eventTsMs?: number;
  conversationId?: string | null;
  entityId?: string | null;
  scope?: string | null;
  scopeSeq?: number;
};

type RealtimeScopeCursorSnapshotEntry = {
  scope: string;
  lastAppliedSeq: number;
  lastAppliedTsMs: number | null;
};

type PendingRealtimeDelta = {
  eventName: string;
  payload: unknown;
  scopeKey: string;
  scopeSeq: number | null;
  eventTsMs: number;
  enqueuedAt: number;
  allowOutOfOrder?: boolean;
  apply: () => void;
};

const processedSocketEventIds = new Map<string, number>();
const scopeCursorByKey = new Map<string, { eventTsMs: number; scopeSeq: number | null }>();
const pendingRealtimeDeltas: PendingRealtimeDelta[] = [];

let isRealtimeSnapshotResyncing = false;

const toSocketEventMeta = (payload: unknown): SocketEventMeta | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = (payload as { eventMeta?: unknown }).eventMeta;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as SocketEventMeta;
};

const resolveEventTimestampMs = (meta: SocketEventMeta | null) => {
  if (typeof meta?.eventTsMs === "number" && Number.isFinite(meta.eventTsMs)) {
    return meta.eventTsMs;
  }

  if (typeof meta?.eventTs === "string") {
    const parsedTs = new Date(meta.eventTs).getTime();
    if (Number.isFinite(parsedTs)) {
      return parsedTs;
    }
  }

  return Date.now();
};

const normalizeScopeSequence = (value: unknown): number | null => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Math.floor(numericValue);
};

const normalizeScopeCursorSnapshot = (
  payload: unknown,
): RealtimeScopeCursorSnapshotEntry[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const seenScopes = new Set<string>();
  const normalizedEntries: RealtimeScopeCursorSnapshotEntry[] = [];

  payload.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }

    const candidate = entry as {
      scope?: unknown;
      lastAppliedSeq?: unknown;
      lastAppliedTsMs?: unknown;
    };

    const scope =
      typeof candidate.scope === "string" ||
      typeof candidate.scope === "number" ||
      typeof candidate.scope === "boolean" ||
      typeof candidate.scope === "bigint"
        ? String(candidate.scope).trim()
        : "";
    if (!scope || seenScopes.has(scope)) {
      return;
    }

    seenScopes.add(scope);

    const lastAppliedSeq = Number(candidate.lastAppliedSeq);
    const lastAppliedTsMs = Number(candidate.lastAppliedTsMs);

    normalizedEntries.push({
      scope,
      lastAppliedSeq:
        Number.isFinite(lastAppliedSeq) && lastAppliedSeq > 0
          ? Math.floor(lastAppliedSeq)
          : 0,
      lastAppliedTsMs:
        Number.isFinite(lastAppliedTsMs) && lastAppliedTsMs > 0
          ? Math.floor(lastAppliedTsMs)
          : null,
    });
  });

  return normalizedEntries;
};

const pruneSocketEventTracking = (now = Date.now()) => {
  processedSocketEventIds.forEach((seenAt, eventId) => {
    if (now - seenAt > SOCKET_EVENT_DEDUPE_WINDOW_MS) {
      processedSocketEventIds.delete(eventId);
    }
  });

  scopeCursorByKey.forEach((cursor, scopeKey) => {
    if (now - cursor.eventTsMs > SOCKET_EVENT_SCOPE_WINDOW_MS) {
      scopeCursorByKey.delete(scopeKey);
    }
  });
};

const buildEventScopeKey = ({
  eventName,
  meta,
}: {
  eventName: string;
  meta: SocketEventMeta | null;
}) => {
  if (typeof meta?.scope === "string" && meta.scope.trim()) {
    return meta.scope.trim();
  }

  if (typeof meta?.conversationId === "string" && meta.conversationId.trim()) {
    return `conversation:${meta.conversationId.trim()}`;
  }

  return `event:${eventName}`;
};

const applyScopeCursorSnapshot = (
  scopeCursorSnapshot: RealtimeScopeCursorSnapshotEntry[],
) => {
  if (scopeCursorSnapshot.length === 0) {
    return;
  }

  scopeCursorSnapshot.forEach((scopeCursorEntry) => {
    const scopeKey = scopeCursorEntry.scope.trim();
    if (!scopeKey) {
      return;
    }

    const snapshotScopeSeq = normalizeScopeSequence(
      scopeCursorEntry.lastAppliedSeq,
    );
    const snapshotTsMs = Number(scopeCursorEntry.lastAppliedTsMs || 0);
    const currentCursor = scopeCursorByKey.get(scopeKey);

    let nextScopeSeq = currentCursor?.scopeSeq ?? null;
    if (nextScopeSeq === null && snapshotScopeSeq !== null) {
      nextScopeSeq = snapshotScopeSeq;
    } else if (nextScopeSeq !== null && snapshotScopeSeq !== null) {
      nextScopeSeq = Math.max(nextScopeSeq, snapshotScopeSeq);
    }

    const nextEventTsMs = Math.max(
      Number(currentCursor?.eventTsMs || 0),
      Number.isFinite(snapshotTsMs) ? snapshotTsMs : 0,
    );

    if (
      currentCursor?.scopeSeq === (nextScopeSeq ?? null) &&
      currentCursor?.eventTsMs === nextEventTsMs
    ) {
      return;
    }

    scopeCursorByKey.set(scopeKey, {
      scopeSeq: nextScopeSeq,
      eventTsMs: nextEventTsMs,
    });
  });
};

const MONGO_OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const buildRealtimeScopeHintsForResync = () => {
  const scopeHints = new Set<string>();
  const currentUserId = String(useAuthStore.getState().user?._id || "").trim();
  if (currentUserId) {
    scopeHints.add(currentUserId);
    scopeHints.add(`user:${currentUserId}`);
  }

  const currentChatState = useChatStore.getState();
  const conversationIds = [
    ...currentChatState.conversations.map((conversation) => conversation._id),
    currentChatState.activeConversationId,
  ];

  conversationIds.forEach((conversationId) => {
    const normalizedConversationId = String(conversationId || "").trim();
    if (!MONGO_OBJECT_ID_PATTERN.test(normalizedConversationId)) {
      return;
    }

    scopeHints.add(normalizedConversationId);
    scopeHints.add(`conversation:${normalizedConversationId}`);
  });

  return Array.from(scopeHints);
};

const requestRealtimeResyncSnapshot = async (
  socket: Socket,
  scopeHints: string[],
): Promise<RealtimeScopeCursorSnapshotEntry[]> => {
  return new Promise((resolve) => {
    let settled = false;

    const finalize = (scopeCursorSnapshot: RealtimeScopeCursorSnapshotEntry[]) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(scopeCursorSnapshot);
    };

    const timeoutId = globalThis.setTimeout(() => {
      finalize([]);
    }, 2500);

    socket.emit(
      "realtime-resync-request",
      {
        scopeHints,
      },
      (response: unknown) => {
        globalThis.clearTimeout(timeoutId);

        const payload =
          response && typeof response === "object"
            ? (response as { scopeCursors?: unknown })
            : null;

        finalize(normalizeScopeCursorSnapshot(payload?.scopeCursors));
      },
    );
  });
};

const shouldProcessSocketEvent = ({
  eventName,
  payload,
  dedupeOrderingEnabled,
  allowOutOfOrder,
}: {
  eventName: string;
  payload: unknown;
  dedupeOrderingEnabled: boolean;
  allowOutOfOrder?: boolean;
}) => {
  if (!dedupeOrderingEnabled) {
    return true;
  }

  const meta = toSocketEventMeta(payload);
  if (!meta) {
    return true;
  }

  const now = Date.now();
  pruneSocketEventTracking(now);

  const eventId = typeof meta.eventId === "string" ? meta.eventId.trim() : "";
  if (eventId) {
    if (processedSocketEventIds.has(eventId)) {
      return false;
    }
    processedSocketEventIds.set(eventId, now);
  }

  const scopeKey = buildEventScopeKey({ eventName, meta });
  const incomingTsMs = resolveEventTimestampMs(meta);
  const incomingScopeSeq = normalizeScopeSequence(meta.scopeSeq);
  const currentCursor = scopeCursorByKey.get(scopeKey);

  if (currentCursor) {
    if (
      incomingScopeSeq !== null &&
      currentCursor.scopeSeq !== null &&
      incomingScopeSeq < currentCursor.scopeSeq
    ) {
      return false;
    }

    if (!allowOutOfOrder && incomingTsMs < currentCursor.eventTsMs) {
      return false;
    }
  }

  scopeCursorByKey.set(scopeKey, {
    eventTsMs: incomingTsMs,
    scopeSeq: incomingScopeSeq,
  });

  return true;
};

const queueRealtimeDelta = ({
  eventName,
  payload,
  allowOutOfOrder,
  apply,
}: {
  eventName: string;
  payload: unknown;
  allowOutOfOrder?: boolean;
  apply: () => void;
}) => {
  const eventMeta = toSocketEventMeta(payload);
  const eventTsMs = resolveEventTimestampMs(eventMeta);
  const scopeKey = buildEventScopeKey({ eventName, meta: eventMeta });

  pendingRealtimeDeltas.push({
    eventName,
    payload,
    scopeKey,
    scopeSeq: normalizeScopeSequence(eventMeta?.scopeSeq),
    eventTsMs,
    enqueuedAt: Date.now(),
    allowOutOfOrder,
    apply,
  });

  if (pendingRealtimeDeltas.length > MAX_QUEUED_REALTIME_DELTAS) {
    pendingRealtimeDeltas.splice(
      0,
      pendingRealtimeDeltas.length - MAX_QUEUED_REALTIME_DELTAS,
    );
  }
};

const flushQueuedRealtimeDeltas = () => {
  if (pendingRealtimeDeltas.length === 0) {
    return;
  }

  pendingRealtimeDeltas.sort((firstDelta, secondDelta) => {
    if (
      firstDelta.scopeKey === secondDelta.scopeKey &&
      firstDelta.scopeSeq !== null &&
      secondDelta.scopeSeq !== null &&
      firstDelta.scopeSeq !== secondDelta.scopeSeq
    ) {
      return firstDelta.scopeSeq - secondDelta.scopeSeq;
    }

    if (firstDelta.eventTsMs !== secondDelta.eventTsMs) {
      return firstDelta.eventTsMs - secondDelta.eventTsMs;
    }

    return firstDelta.enqueuedAt - secondDelta.enqueuedAt;
  });

  const drained = pendingRealtimeDeltas.splice(0, pendingRealtimeDeltas.length);
  drained.forEach((delta) => {
    const shouldApplyEvent = shouldProcessSocketEvent({
      eventName: delta.eventName,
      payload: delta.payload,
      dedupeOrderingEnabled:
        useSocketStore.getState().featureFlags.realtime_event_dedupe_ordering,
      allowOutOfOrder: delta.allowOutOfOrder,
    });

    if (!shouldApplyEvent) {
      return;
    }

    delta.apply();
  });
};

const clearQueuedRealtimeDeltas = () => {
  pendingRealtimeDeltas.splice(0, pendingRealtimeDeltas.length);
};

const pendingLikeUpdates = new Map<
  string,
  {
    likesCount: number;
    ownReaction: SocialReactionType | null;
    reactionSummary?: SocialReactionSummary;
    actor?: SocialUserLite;
  }
>();

const pendingCommentUpdates = new Map<
  string,
  { commentsCount?: number; comments: SocialComment[] }
>();

const pendingCreatedPosts = new Map<string, SocialPost>();
const pendingUpdatedPosts = new Map<string, SocialPost>();
const pendingDeletedPostIds = new Set<string>();
const pendingDeletedCommentUpdates = new Map<
  string,
  { deletedCommentIds: string[]; commentsCount?: number }
>();

const normalizeGroupChannelId = (value: unknown) => {
  const scalarValue =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
      ? String(value)
      : "";

  const normalized = scalarValue
    .trim()
    .toLowerCase();

  return normalized || "general";
};

const shouldAutoMarkSeenForIncomingMessage = ({
  activeConversationId,
  conversations,
  message,
}: {
  activeConversationId: string | null;
  conversations: Array<{
    _id: string;
    type: "direct" | "group";
    group?: {
      activeChannelId?: string;
    };
  }>;
  message: {
    conversationId: string;
    groupChannelId?: string | null;
  };
}) => {
  if (activeConversationId !== message.conversationId) {
    return false;
  }

  const activeConversation = conversations.find(
    (conversationItem) => conversationItem._id === message.conversationId,
  );

  if (activeConversation?.type !== "group") {
    return true;
  }

  const activeChannelId = normalizeGroupChannelId(
    activeConversation.group?.activeChannelId,
  );
  const incomingChannelId = normalizeGroupChannelId(message.groupChannelId);

  return activeChannelId === incomingChannelId;
};

type SocialBurstPayload = {
  likeUpdates: Map<
    string,
    {
      likesCount: number;
      ownReaction: SocialReactionType | null;
      reactionSummary?: SocialReactionSummary;
      actor?: SocialUserLite;
    }
  >;
  commentUpdates: Map<string, { commentsCount?: number; comments: SocialComment[] }>;
  createdPosts: SocialPost[];
  updatedPosts: Map<string, SocialPost>;
  deletedPostIds: Set<string>;
  deletedCommentUpdates: Map<string, { deletedCommentIds: string[]; commentsCount?: number }>;
};

const cloneAndResetSocialBurstPayload = (): SocialBurstPayload => {
  const payload: SocialBurstPayload = {
    likeUpdates: new Map(pendingLikeUpdates),
    commentUpdates: new Map(pendingCommentUpdates),
    createdPosts: Array.from(pendingCreatedPosts.values()),
    updatedPosts: new Map(pendingUpdatedPosts),
    deletedPostIds: new Set(pendingDeletedPostIds),
    deletedCommentUpdates: new Map(pendingDeletedCommentUpdates),
  };

  pendingLikeUpdates.clear();
  pendingCommentUpdates.clear();
  pendingCreatedPosts.clear();
  pendingUpdatedPosts.clear();
  pendingDeletedPostIds.clear();
  pendingDeletedCommentUpdates.clear();

  return payload;
};

const isSocialBurstPayloadEmpty = (payload: SocialBurstPayload) => {
  return (
    payload.likeUpdates.size === 0 &&
    payload.commentUpdates.size === 0 &&
    payload.createdPosts.length === 0 &&
    payload.updatedPosts.size === 0 &&
    payload.deletedPostIds.size === 0 &&
    payload.deletedCommentUpdates.size === 0
  );
};

const buildCreatedCandidates = ({
  posts,
  listType,
  profileId,
  currentUserId,
  createdPosts,
}: {
  posts: SocialPost[];
  listType: "home" | "explore" | "profile";
  profileId: string;
  currentUserId: string;
  createdPosts: SocialPost[];
}) => {
  return createdPosts.filter((post) => {
    if (posts.some((existingPost) => existingPost._id === post._id)) {
      return false;
    }

    if (listType === "explore") {
      if (post.privacy !== "public") {
        return false;
      }

      return String(post.authorId?._id || "") !== currentUserId;
    }

    if (listType === "profile") {
      return profileId === String(post.authorId?._id || "");
    }

    return true;
  });
};

const applyLikeUpdatesToPosts = ({
  posts,
  currentUserId,
  likeUpdates,
}: {
  posts: SocialPost[];
  currentUserId: string;
  likeUpdates: SocialBurstPayload["likeUpdates"];
}) => {
  if (likeUpdates.size === 0) {
    return posts;
  }

  return posts.map((post) => {
    const likeUpdate = likeUpdates.get(post._id);
    if (!likeUpdate) {
      return post;
    }

    const actorId = String(likeUpdate.actor?._id || "");
    const shouldApplyIsLiked = Boolean(currentUserId) && actorId === currentUserId;

    return {
      ...post,
      likesCount: likeUpdate.likesCount,
      ownReaction: shouldApplyIsLiked ? likeUpdate.ownReaction : post.ownReaction,
      isLiked: shouldApplyIsLiked ? likeUpdate.ownReaction === "like" : post.isLiked,
      reactionSummary: likeUpdate.reactionSummary || post.reactionSummary,
    };
  });
};

const applyCommentCountUpdatesToPosts = ({
  posts,
  commentUpdates,
  deletedCommentUpdates,
}: {
  posts: SocialPost[];
  commentUpdates: SocialBurstPayload["commentUpdates"];
  deletedCommentUpdates: SocialBurstPayload["deletedCommentUpdates"];
}) => {
  const hasCommentCountUpdates =
    commentUpdates.size > 0 || deletedCommentUpdates.size > 0;
  if (!hasCommentCountUpdates) {
    return posts;
  }

  return posts.map((post) => {
    const commentUpdate = commentUpdates.get(post._id);
    const deletedCommentUpdate = deletedCommentUpdates.get(post._id);

    if (!commentUpdate && !deletedCommentUpdate) {
      return post;
    }

    let nextCommentsCount = post.commentsCount;
    if (typeof commentUpdate?.commentsCount === "number") {
      nextCommentsCount = commentUpdate.commentsCount;
    }
    if (typeof deletedCommentUpdate?.commentsCount === "number") {
      nextCommentsCount = deletedCommentUpdate.commentsCount;
    }

    return {
      ...post,
      commentsCount: nextCommentsCount,
    };
  });
};

const applyPostMutations = ({
  posts,
  listType,
  profileId,
  currentUserId,
  payload,
}: {
  posts: SocialPost[];
  listType: "home" | "explore" | "profile";
  profileId: string;
  currentUserId: string;
  payload: SocialBurstPayload;
}) => {
  const createdCandidates = buildCreatedCandidates({
    posts,
    listType,
    profileId,
    currentUserId,
    createdPosts: payload.createdPosts,
  });

  let nextPosts = [...createdCandidates, ...posts];

  if (payload.updatedPosts.size > 0) {
    nextPosts = nextPosts.map((post) => {
      const updated = payload.updatedPosts.get(post._id);
      return updated ? { ...post, ...updated } : post;
    });
  }

  if (payload.deletedPostIds.size > 0) {
    nextPosts = nextPosts.filter((post) => !payload.deletedPostIds.has(post._id));
  }

  nextPosts = applyLikeUpdatesToPosts({
    posts: nextPosts,
    currentUserId,
    likeUpdates: payload.likeUpdates,
  });

  nextPosts = applyCommentCountUpdatesToPosts({
    posts: nextPosts,
    commentUpdates: payload.commentUpdates,
    deletedCommentUpdates: payload.deletedCommentUpdates,
  });

  return nextPosts;
};

const isValidMongoObjectId = (value: unknown) => {
  if (typeof value !== "string") {
    return false;
  }

  return MONGO_OBJECT_ID_PATTERN.test(value);
};

const joinConversationRoomIfValid = (socket: Socket, conversationId: unknown) => {
  if (!isValidMongoObjectId(conversationId)) {
    return;
  }

  socket.emit("join-conversation", conversationId);
};

const joinConversationRooms = (socket: Socket, conversations: Array<{ _id?: unknown }>) => {
  conversations.forEach((conversationItem) => {
    joinConversationRoomIfValid(socket, conversationItem?._id);
  });
};

const joinActiveConversationRoom = (socket: Socket) => {
  const activeConversationId = useChatStore.getState().activeConversationId;
  joinConversationRoomIfValid(socket, activeConversationId);
};

const findConversationById = (
  conversations: Conversation[],
  conversationId: string,
) => {
  for (const conversation of conversations) {
    if (conversation._id === conversationId) {
      return conversation;
    }
  }

  return null;
};

const removeConversationById = (
  conversations: Conversation[],
  conversationId: string,
) => {
  return conversations.filter(
    (conversationItem) => conversationItem._id !== conversationId,
  );
};

const findMessageInConversationBucket = ({
  messagesByConversation,
  conversationId,
  messageId,
}: {
  messagesByConversation: ReturnType<typeof useChatStore.getState>["messages"];
  conversationId: string;
  messageId: string;
}) => {
  const targetBucket = messagesByConversation?.[conversationId]?.items;
  if (!Array.isArray(targetBucket) || targetBucket.length === 0) {
    return null;
  }

  for (const messageItem of targetBucket) {
    if (messageItem._id === messageId) {
      return messageItem;
    }
  }

  return null;
};

const rejoinRoomsAfterReconnect = async (socket: Socket) => {
  try {
    await useChatStore.getState().fetchConversations();
    const freshConversations = useChatStore.getState().conversations || [];
    joinConversationRooms(socket, freshConversations);
  } finally {
    // Fallback behavior is preserved by always attempting active room join.
    joinActiveConversationRoom(socket);
  }
};

const buildNextPostComments = ({
  statePostComments,
  payload,
}: {
  statePostComments: ReturnType<typeof useSocialStore.getState>["postComments"];
  payload: SocialBurstPayload;
}) => {
  const nextPostComments = { ...statePostComments };

  payload.commentUpdates.forEach((commentUpdate, postId) => {
    const mergedComments = [...(nextPostComments[postId] || [])];
    commentUpdate.comments.forEach((incomingComment) => {
      if (!mergedComments.some((comment) => comment._id === incomingComment._id)) {
        mergedComments.push(incomingComment);
      }
    });
    nextPostComments[postId] = mergedComments;
  });

  payload.deletedPostIds.forEach((postId) => {
    delete nextPostComments[postId];
  });

  payload.deletedCommentUpdates.forEach((deletedCommentUpdate, postId) => {
    const currentComments = nextPostComments[postId];
    if (!Array.isArray(currentComments) || currentComments.length === 0) {
      return;
    }

    const deletedSet = new Set(deletedCommentUpdate.deletedCommentIds);
    nextPostComments[postId] = currentComments.filter(
      (comment) => !deletedSet.has(comment._id),
    );
  });

  return nextPostComments;
};

const applyLikeUpdatesToEngagement = ({
  nextPostEngagement,
  payload,
}: {
  nextPostEngagement: ReturnType<typeof useSocialStore.getState>["postEngagement"];
  payload: SocialBurstPayload;
}) => {
  payload.likeUpdates.forEach((likeUpdate, postId) => {
    const currentEngagement = nextPostEngagement[postId];
    if (!currentEngagement) {
      return;
    }

    let nextLikers = currentEngagement.likers;
    const actorId = String(likeUpdate.actor?._id || "");
    if (actorId) {
      if (likeUpdate.ownReaction) {
        const actorAlreadyExists = nextLikers.some(
          (liker) => String(liker._id) === actorId,
        );

        if (!actorAlreadyExists && likeUpdate.actor?._id) {
          nextLikers = [likeUpdate.actor, ...nextLikers].slice(0, 50);
        }
      } else {
        nextLikers = nextLikers.filter((liker) => String(liker._id) !== actorId);
      }
    }

    nextPostEngagement[postId] = {
      ...currentEngagement,
      likers: nextLikers,
    };
  });
};

const applyCommentUpdatesToEngagement = ({
  nextPostEngagement,
  payload,
}: {
  nextPostEngagement: ReturnType<typeof useSocialStore.getState>["postEngagement"];
  payload: SocialBurstPayload;
}) => {
  payload.commentUpdates.forEach((commentUpdate, postId) => {
    const currentEngagement = nextPostEngagement[postId];
    if (!currentEngagement) {
      return;
    }

    let nextRecentComments = [...currentEngagement.recentComments];
    let nextCommenters = [...currentEngagement.commenters];

    commentUpdate.comments.forEach((incomingComment) => {
      nextRecentComments = [
        {
          _id: incomingComment._id,
          authorId: incomingComment.authorId,
          content: incomingComment.content,
          createdAt: incomingComment.createdAt,
        },
        ...nextRecentComments.filter(
          (recentComment) => recentComment._id !== incomingComment._id,
        ),
      ].slice(0, 30);

      const commenterId = String(incomingComment.authorId?._id || "");
      if (
        commenterId &&
        !nextCommenters.some((commenter) => String(commenter._id) === commenterId)
      ) {
        nextCommenters = [incomingComment.authorId, ...nextCommenters].slice(0, 50);
      }
    });

    nextPostEngagement[postId] = {
      ...currentEngagement,
      recentComments: nextRecentComments,
      commenters: nextCommenters,
    };
  });
};

const applyDeletedPostAndCommentUpdatesToEngagement = ({
  nextPostEngagement,
  payload,
}: {
  nextPostEngagement: ReturnType<typeof useSocialStore.getState>["postEngagement"];
  payload: SocialBurstPayload;
}) => {
  payload.deletedPostIds.forEach((postId) => {
    delete nextPostEngagement[postId];
  });

  payload.deletedCommentUpdates.forEach((deletedCommentUpdate, postId) => {
    const currentEngagement = nextPostEngagement[postId];
    if (!currentEngagement) {
      return;
    }

    const deletedSet = new Set(deletedCommentUpdate.deletedCommentIds);
    const nextRecentComments = currentEngagement.recentComments.filter(
      (comment) => !deletedSet.has(comment._id),
    );

    nextPostEngagement[postId] = {
      ...currentEngagement,
      recentComments: nextRecentComments,
    };
  });
};

const buildNextPostEngagement = ({
  statePostEngagement,
  payload,
}: {
  statePostEngagement: ReturnType<typeof useSocialStore.getState>["postEngagement"];
  payload: SocialBurstPayload;
}) => {
  const nextPostEngagement = { ...statePostEngagement };

  applyLikeUpdatesToEngagement({
    nextPostEngagement,
    payload,
  });

  applyCommentUpdatesToEngagement({
    nextPostEngagement,
    payload,
  });

  applyDeletedPostAndCommentUpdatesToEngagement({
    nextPostEngagement,
    payload,
  });

  return nextPostEngagement;
};

const buildNextProfile = ({
  state,
  payload,
}: {
  state: ReturnType<typeof useSocialStore.getState>;
  payload: SocialBurstPayload;
}) => {
  if (!state.profile) {
    return state.profile;
  }

  const profileId = String(state.profile._id || "");
  const createdByProfileCount = payload.createdPosts.filter(
    (post) => String(post.authorId?._id || "") === profileId,
  ).length;
  const deletedByProfileCount = state.profilePosts.filter(
    (post) =>
      String(post.authorId?._id || "") === profileId &&
      payload.deletedPostIds.has(post._id),
  ).length;

  if (createdByProfileCount === 0 && deletedByProfileCount === 0) {
    return state.profile;
  }

  return {
    ...state.profile,
    postCount: Math.max(
      0,
      state.profile.postCount + createdByProfileCount - deletedByProfileCount,
    ),
  };
};

const applySocialBurstState = (
  state: ReturnType<typeof useSocialStore.getState>,
  payload: SocialBurstPayload,
) => {
  const currentUserId = String(useAuthStore.getState().user?._id || "");
  const profileId = String(state.profile?._id || "");

  const homeFeed = applyPostMutations({
    posts: state.homeFeed,
    listType: "home",
    profileId,
    currentUserId,
    payload,
  });
  const exploreFeed = applyPostMutations({
    posts: state.exploreFeed,
    listType: "explore",
    profileId,
    currentUserId,
    payload,
  });
  const profilePosts = applyPostMutations({
    posts: state.profilePosts,
    listType: "profile",
    profileId,
    currentUserId,
    payload,
  });

  const postComments = buildNextPostComments({
    statePostComments: state.postComments,
    payload,
  });
  const postEngagement = buildNextPostEngagement({
    statePostEngagement: state.postEngagement,
    payload,
  });

  return {
    homeFeed,
    exploreFeed,
    profilePosts,
    profile: buildNextProfile({ state, payload }),
    postComments,
    postEngagement,
  };
};

const scheduleSocialBurstFlush = () => {
  if (socialBurstTimer) {
    return;
  }

  socialBurstTimer = setTimeout(() => {
    socialBurstTimer = null;

    const payload = cloneAndResetSocialBurstPayload();

    if (isSocialBurstPayloadEmpty(payload)) {
      return;
    }

    useSocialStore.setState((state) => applySocialBurstState(state, payload));
  }, SOCIAL_BURST_DEBOUNCE_MS);
};

const queueSocialLikeUpdate = (payload: {
  postId: string;
  likesCount: number;
  ownReaction: SocialReactionType | null;
  reactionSummary?: SocialReactionSummary;
  actor?: SocialUserLite;
}) => {
  pendingLikeUpdates.set(payload.postId, {
    likesCount: payload.likesCount,
    ownReaction: payload.ownReaction,
    reactionSummary: payload.reactionSummary,
    actor: payload.actor,
  });
  scheduleSocialBurstFlush();
};

const queueSocialCommentUpdate = (payload: {
  postId: string;
  comment: SocialComment;
  commentsCount?: number;
}) => {
  const current = pendingCommentUpdates.get(payload.postId) || {
    comments: [],
  };

  const alreadyExists = current.comments.some(
    (comment) => comment._id === payload.comment._id,
  );

  pendingCommentUpdates.set(payload.postId, {
    commentsCount:
      typeof payload.commentsCount === "number"
        ? payload.commentsCount
        : current.commentsCount,
    comments: alreadyExists
      ? current.comments
      : [...current.comments, payload.comment],
  });

  scheduleSocialBurstFlush();
};

const queueSocialCreatedPost = (post: SocialPost) => {
  pendingCreatedPosts.set(post._id, post);
  scheduleSocialBurstFlush();
};

const queueSocialUpdatedPost = (post: SocialPost) => {
  pendingUpdatedPosts.set(post._id, post);
  scheduleSocialBurstFlush();
};

const queueSocialDeletedPost = (postId: string) => {
  if (!postId) {
    return;
  }

  pendingDeletedPostIds.add(postId);
  scheduleSocialBurstFlush();
};

const queueSocialDeletedComments = (payload: {
  postId: string;
  deletedCommentIds: string[];
  commentsCount?: number;
}) => {
  if (!payload.postId || payload.deletedCommentIds.length === 0) {
    return;
  }

  const current = pendingDeletedCommentUpdates.get(payload.postId);
  const mergedDeletedIds = new Set([
    ...(current?.deletedCommentIds || []),
    ...payload.deletedCommentIds,
  ]);

  pendingDeletedCommentUpdates.set(payload.postId, {
    deletedCommentIds: [...mergedDeletedIds],
    commentsCount:
      typeof payload.commentsCount === "number"
        ? payload.commentsCount
        : current?.commentsCount,
  });
  scheduleSocialBurstFlush();
};

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
const RECENTLY_ACTIVE_WINDOW_MS = 59 * 60 * 1000; // 59 minutes

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
  featureFlags: resolveFeatureFlags(),
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
  isFeatureEnabled: (flagKey: AppFeatureFlagKey) => {
    return isFeatureFlagEnabled(get().featureFlags, flagKey);
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

    const applyRealtimeAwareEvent = ({
      eventName,
      payload,
      apply,
      queueDuringSnapshot,
      allowOutOfOrder,
    }: {
      eventName: string;
      payload: unknown;
      apply: () => void;
      queueDuringSnapshot?: boolean;
      allowOutOfOrder?: boolean;
    }) => {
      const featureFlags = get().featureFlags;
      const shouldQueueDelta =
        Boolean(queueDuringSnapshot) &&
        featureFlags.realtime_snapshot_delta_resync &&
        isRealtimeSnapshotResyncing;

      if (shouldQueueDelta) {
        queueRealtimeDelta({
          eventName,
          payload,
          allowOutOfOrder,
          apply,
        });
        return;
      }

      const shouldApplyEvent = shouldProcessSocketEvent({
        eventName,
        payload,
        dedupeOrderingEnabled: featureFlags.realtime_event_dedupe_ordering,
        allowOutOfOrder,
      });

      if (!shouldApplyEvent) {
        return;
      }

      apply();
    };

    socket.on("connect", () => {
      // Proactively join known rooms to reduce missed events while backend is still
      // fetching conversations. Filter out temp IDs ("temp-direct-...") that are
      // never persisted on the server — joining them would be a no-op but wastes bandwidth.
      const conversations = useChatStore.getState().conversations || [];
      joinConversationRooms(socket, conversations);
      joinActiveConversationRoom(socket);
    });

    socket.on("reconnect_attempt", () => {
      const latestToken = useAuthStore.getState().accessToken;
      if (latestToken) {
        socket.auth = { token: latestToken };
      }
    });

    socket.on("feature-flags", (payload: { flags?: unknown }) => {
      const sanitizedServerFlags = sanitizeServerFeatureFlags(payload?.flags);

      set((state) => ({
        featureFlags: resolveFeatureFlags({
          ...state.featureFlags,
          ...sanitizedServerFlags,
        }),
      }));
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

      isRealtimeSnapshotResyncing = false;
      clearQueuedRealtimeDeltas();

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
      // Refetch conversation list from server after reconnect to evict stale data
      // (deleted conversations, groups the user was kicked from, etc.).
      // Once fetched, rejoin rooms for all valid conversations.
      void (async () => {
        const featureFlagsAtReconnect = get().featureFlags;
        const shouldEnableSnapshotDelta =
          featureFlagsAtReconnect.realtime_snapshot_delta_resync;
        const resyncScopeHints = buildRealtimeScopeHintsForResync();

        if (shouldEnableSnapshotDelta) {
          isRealtimeSnapshotResyncing = true;
          clearQueuedRealtimeDeltas();
        }

        try {
          if (shouldEnableSnapshotDelta) {
            const scopeCursorSnapshot = await requestRealtimeResyncSnapshot(
              socket,
              resyncScopeHints,
            );

            applyScopeCursorSnapshot(scopeCursorSnapshot);
          }

          await rejoinRoomsAfterReconnect(socket);

          if (shouldEnableSnapshotDelta) {
            const activeConversationId =
              useChatStore.getState().activeConversationId;
            if (activeConversationId) {
              await useChatStore.getState().fetchMessages(activeConversationId);
            }
          }
        } catch (error) {
          console.error("Socket reconnect resync failed", error);
        } finally {
          if (shouldEnableSnapshotDelta) {
            isRealtimeSnapshotResyncing = false;
            flushQueuedRealtimeDeltas();
          }
        }
      })();
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
    socket.on("new-message", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "new-message",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            message?: {
              _id?: string;
              conversationId?: string;
              groupChannelId?: string | null;
              content?: string | null;
              createdAt?: string;
              senderId?: string;
            };
            conversation?: {
              _id?: string;
              lastMessage?: {
                _id?: string;
                content?: string;
                createdAt?: string;
                groupChannelId?: string | null;
                senderId?: string;
              };
              group?: unknown;
            };
            unreadCounts?: Record<string, number>;
          };

          const { message, conversation, unreadCounts } = eventPayload;
          if (!message || !conversation?._id || !conversation?.lastMessage) {
            return;
          }

          useChatStore.getState().addMessage(message as Message);

          const lastMessage: Conversation["lastMessage"] = {
            _id: String(conversation.lastMessage._id || message._id || ""),
            content: String(
              conversation.lastMessage.content ?? message.content ?? "",
            ),
            createdAt: String(
              conversation.lastMessage.createdAt ||
                message.createdAt ||
                new Date().toISOString(),
            ),
            groupChannelId:
              conversation.lastMessage.groupChannelId ??
              message.groupChannelId ??
              null,
            sender: {
              _id: String(conversation.lastMessage.senderId || message.senderId || ""),
              displayName: "",
              avatarUrl: null,
            },
          };

          const updatedConversation: Partial<Conversation> & { _id: string } = {
            _id: conversation._id,
            lastMessage,
            unreadCounts: unreadCounts || {},
          };

          if (conversation.group && typeof conversation.group === "object") {
            updatedConversation.group = conversation.group as Conversation["group"];
          }

          const chatState = useChatStore.getState();

          const existingConversation = findConversationById(
            chatState.conversations,
            conversation._id,
          );

          if (!existingConversation) {
            void useChatStore.getState().fetchConversations();
          }

          const shouldMarkAsSeen = shouldAutoMarkSeenForIncomingMessage({
            activeConversationId: chatState.activeConversationId,
            conversations: chatState.conversations,
            message: {
              conversationId: String(message.conversationId || ""),
              groupChannelId: message.groupChannelId || null,
            },
          });

          useChatStore.getState().updateConversation(updatedConversation);

          if (shouldMarkAsSeen) {
            void useChatStore.getState().markAsSeen();
          }
        },
      });
    });

    // read message
    socket.on("read-message", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "read-message",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversation?: {
              _id?: string;
              lastMessageAt?: string;
              unreadCounts?: Record<string, number>;
              seenBy?: unknown[];
              group?: unknown;
            };
            lastMessage?: unknown;
          };

          if (!eventPayload.conversation?._id) {
            return;
          }

          const updated: Partial<Conversation> & { _id: string } = {
            _id: eventPayload.conversation._id,
          };

          if (eventPayload.lastMessage && typeof eventPayload.lastMessage === "object") {
            updated.lastMessage =
              eventPayload.lastMessage as Conversation["lastMessage"];
          }

          if (eventPayload.conversation.lastMessageAt) {
            updated.lastMessageAt = eventPayload.conversation.lastMessageAt;
          }

          if (eventPayload.conversation.unreadCounts) {
            updated.unreadCounts = eventPayload.conversation.unreadCounts;
          }

          if (Array.isArray(eventPayload.conversation.seenBy)) {
            updated.seenBy =
              eventPayload.conversation.seenBy as Conversation["seenBy"];
          }

          if (
            eventPayload.conversation.group &&
            typeof eventPayload.conversation.group === "object"
          ) {
            updated.group = eventPayload.conversation.group as Conversation["group"];
          }

          useChatStore.getState().updateConversation(updated);
        },
      });
    });

    // new group chat - from other members
    socket.on("new-group", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "new-group",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const conversation = payload as {
            _id?: string;
            group?: { name?: string };
          };

          if (!conversation?._id) {
            return;
          }

          useChatStore
            .getState()
            .addConvo(conversation as Conversation, { setActive: false });
          socket.emit("join-conversation", conversation._id);
          toast.success(
            `You were added to group "${conversation.group?.name || "New group"}"!`,
          );
        },
      });
    });

    // new direct conversation - from other participant
    socket.on("new-conversation", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "new-conversation",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const conversation = payload as { _id?: string };
          if (!conversation?._id) {
            return;
          }

          useChatStore
            .getState()
            .addConvo(conversation as Conversation, { setActive: false });
          socket.emit("join-conversation", conversation._id);
          toast.success("You have a new conversation!");
        },
      });
    });

    socket.on("group-conversation-updated", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "group-conversation-updated",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversation?: {
              _id?: string;
            };
          };

          if (!eventPayload.conversation?._id) {
            return;
          }

          useChatStore.getState().updateConversation(
            eventPayload.conversation as Partial<Conversation> & { _id: string },
          );
        },
      });
    });

    // conversation deleted - from other participants
    socket.on("conversation-deleted", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "conversation-deleted",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as { conversationId?: string };
          const conversationId = String(eventPayload?.conversationId || "").trim();
          if (!conversationId) {
            return;
          }

          socket.emit("leave-conversation", conversationId);

          const currentState = useChatStore.getState();
          const nextConversations = removeConversationById(
            currentState.conversations,
            conversationId,
          );

          useChatStore.setState({
            conversations: nextConversations,
            activeConversationId:
              currentState.activeConversationId === conversationId
                ? null
                : currentState.activeConversationId,
          });

          toast.info("A conversation was deleted");
        },
      });
    });

    // message modifications
    socket.on("message-reacted", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "message-reacted",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversationId?: string;
            messageId?: string;
            reactions?: unknown[];
            updatedAt?: string;
          };

          const conversationId = String(eventPayload.conversationId || "").trim();
          const messageId = String(eventPayload.messageId || "").trim();

          if (!conversationId || !messageId) {
            return;
          }

          const chatState = useChatStore.getState();
          const currentMessage = findMessageInConversationBucket({
            messagesByConversation: chatState.messages,
            conversationId,
            messageId,
          });

          const incomingUpdatedAtTs = eventPayload.updatedAt
            ? new Date(eventPayload.updatedAt).getTime()
            : 0;
          const currentUpdatedAtTs = currentMessage?.updatedAt
            ? new Date(currentMessage.updatedAt).getTime()
            : 0;

          if (
            incomingUpdatedAtTs &&
            currentUpdatedAtTs &&
            incomingUpdatedAtTs < currentUpdatedAtTs
          ) {
            return;
          }

          useChatStore.getState().updateMessage(conversationId, messageId, {
            reactions: Array.isArray(eventPayload.reactions)
              ? (eventPayload.reactions as NonNullable<Message["reactions"]>)
              : [],
            ...(eventPayload.updatedAt ? { updatedAt: eventPayload.updatedAt } : {}),
          });
        },
      });
    });

    socket.on("message-deleted", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "message-deleted",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversationId?: string;
            messageId?: string;
            conversation?: { _id?: string };
            editedAt?: string;
            reactions?: unknown[];
            readBy?: unknown[];
            replyTo?: unknown;
          };

          const conversationId = String(eventPayload.conversationId || "").trim();
          const messageId = String(eventPayload.messageId || "").trim();
          if (!conversationId || !messageId) {
            return;
          }

          useChatStore.getState().updateMessage(conversationId, messageId, {
            isDeleted: true,
            content: "This message was removed",
            imgUrl: null,
            editedAt: eventPayload.editedAt ?? new Date().toISOString(),
            reactions: Array.isArray(eventPayload.reactions)
              ? (eventPayload.reactions as NonNullable<Message["reactions"]>)
              : [],
            readBy: Array.isArray(eventPayload.readBy)
              ? (eventPayload.readBy as string[])
              : [],
            replyTo: eventPayload.replyTo
              ? (eventPayload.replyTo as Message["replyTo"])
              : null,
          });

          if (eventPayload.conversation?._id) {
            useChatStore.getState().updateConversation(
              eventPayload.conversation as Partial<Conversation> & { _id: string },
            );
          }
        },
      });
    });

    socket.on("message-hidden-for-user", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "message-hidden-for-user",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversationId?: string;
            messageId?: string;
            conversation?: { _id?: string };
          };

          const conversationId = String(eventPayload.conversationId || "").trim();
          const messageId = String(eventPayload.messageId || "").trim();
          if (!conversationId || !messageId) {
            return;
          }

          useChatStore
            .getState()
            .removeMessageFromConversation(conversationId, messageId);

          if (eventPayload.conversation?._id) {
            useChatStore.getState().updateConversation(
              eventPayload.conversation as Partial<Conversation> & { _id: string },
            );
          }
        },
      });
    });

    socket.on("message-edited", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "message-edited",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversationId?: string;
            messageId?: string;
            content?: string;
            editedAt?: string;
            conversation?: { _id?: string };
          };

          const conversationId = String(eventPayload.conversationId || "").trim();
          const messageId = String(eventPayload.messageId || "").trim();
          if (!conversationId || !messageId) {
            return;
          }

          const chatState = useChatStore.getState();
          const currentMessage = findMessageInConversationBucket({
            messagesByConversation: chatState.messages,
            conversationId,
            messageId,
          });

          if (currentMessage?.isDeleted) {
            return;
          }

          const incomingEditedAtTs = eventPayload.editedAt
            ? new Date(eventPayload.editedAt).getTime()
            : 0;
          const currentEditedAtTs = currentMessage?.editedAt
            ? new Date(currentMessage.editedAt).getTime()
            : 0;

          if (
            incomingEditedAtTs &&
            currentEditedAtTs &&
            incomingEditedAtTs < currentEditedAtTs
          ) {
            return;
          }

          useChatStore
            .getState()
            .updateMessage(conversationId, messageId, {
              content: eventPayload.content,
              editedAt: eventPayload.editedAt,
            });

          if (eventPayload.conversation?._id) {
            useChatStore.getState().updateConversation(
              eventPayload.conversation as Partial<Conversation> & { _id: string },
            );
          }
        },
      });
    });

    socket.on("message-read", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "message-read",
        payload,
        queueDuringSnapshot: true,
        apply: () => {
          const eventPayload = payload as {
            conversationId?: string;
            messageId?: string;
            readBy?: unknown[];
          };

          const conversationId = String(eventPayload.conversationId || "").trim();
          const messageId = String(eventPayload.messageId || "").trim();
          if (!conversationId || !messageId) {
            return;
          }

          const chatState = useChatStore.getState();
          const currentMessage = findMessageInConversationBucket({
            messagesByConversation: chatState.messages,
            conversationId,
            messageId,
          });

          const currentReadBy = Array.isArray(currentMessage?.readBy)
            ? currentMessage.readBy.map(String)
            : [];
          const incomingReadBy = Array.isArray(eventPayload.readBy)
            ? eventPayload.readBy.map(String)
            : [];
          const mergedReadBy = [...new Set([...currentReadBy, ...incomingReadBy])];

          useChatStore.getState().updateMessage(conversationId, messageId, {
            readBy: mergedReadBy,
          });
        },
      });
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
    socket.on("friend-request-accepted", ({ from, message, notification }) => {
      try {
        if (notification) {
          useNotificationStore.getState().addSocialNotification(notification);
        } else {
          // Fallback legacy memory-only notification just in case
          useNotificationStore.getState().addAcceptanceNotification({
            type: "friend-accepted",
            from,
            message,
            createdAt: new Date(),
          });
        }
      } catch (error) {
        console.error("Error adding notification:", error);
      }
      toast.success(message, {
        description: `${from?.displayName} is now your friend!`,
        action: {
          label: "View",
          onClick: () => {
            useNotificationStore.getState().setIsHubOpen(true);
          },
        },
      });
    });

    // Friend removed - other user's friend list updates in realtime
    socket.on("friend-removed", ({ removedBy }) => {
      if (!removedBy) return;
      const friendStore = useFriendStore.getState();
      friendStore.getFriends();
    });

    socket.on("social-notification", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-notification",
        payload,
        apply: () => {
          const eventPayload = payload as {
            notification?: {
              actorId?: { displayName?: string };
              type?: string;
              message?: string;
            };
          };

          const notification = eventPayload.notification;
          if (!notification) {
            return;
          }

          useNotificationStore
            .getState()
            .addSocialNotification(notification as SocialNotification);
          const currentNotifications = useSocialStore.getState().notifications;
          useSocialStore.setState({
            notifications: [
              notification as SocialNotification,
              ...currentNotifications,
            ],
          });

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
        },
      });
    });

    socket.on("social-post-like-updated", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-post-like-updated",
        payload,
        apply: () => {
          const eventPayload = payload as {
            postId?: string;
            likesCount?: number;
            reactionType?: SocialReactionType | null;
            reactionSummary?: SocialReactionSummary;
            actor?: SocialUserLite;
          };

          if (!eventPayload.postId || typeof eventPayload.likesCount !== "number") {
            return;
          }

          queueSocialLikeUpdate({
            postId: eventPayload.postId,
            likesCount: eventPayload.likesCount,
            ownReaction: eventPayload.reactionType || null,
            reactionSummary: eventPayload.reactionSummary,
            actor: eventPayload.actor,
          });
        },
      });
    });

    socket.on("social-post-comment-added", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-post-comment-added",
        payload,
        apply: () => {
          const eventPayload = payload as {
            postId?: string;
            comment?: SocialComment;
            commentsCount?: number;
          };

          if (!eventPayload.postId || !eventPayload.comment?._id) {
            return;
          }

          queueSocialCommentUpdate({
            postId: eventPayload.postId,
            comment: eventPayload.comment,
            commentsCount: eventPayload.commentsCount,
          });
        },
      });
    });

    socket.on("social-post-created", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-post-created",
        payload,
        apply: () => {
          const eventPayload = payload as { post?: SocialPost };
          if (!eventPayload.post?._id) {
            return;
          }

          queueSocialCreatedPost(eventPayload.post);
        },
      });
    });

    socket.on("social-post-updated", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-post-updated",
        payload,
        apply: () => {
          const eventPayload = payload as { post?: SocialPost };
          if (!eventPayload.post?._id) {
            return;
          }

          queueSocialUpdatedPost(eventPayload.post);
        },
      });
    });

    socket.on("social-post-deleted", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-post-deleted",
        payload,
        apply: () => {
          const eventPayload = payload as { postId?: string };
          const postId = String(eventPayload.postId || "").trim();
          if (!postId) {
            return;
          }

          queueSocialDeletedPost(postId);
        },
      });
    });

    socket.on("social-post-comment-deleted", (payload) => {
      applyRealtimeAwareEvent({
        eventName: "social-post-comment-deleted",
        payload,
        apply: () => {
          const eventPayload = payload as {
            postId?: string;
            commentId?: string;
            deletedCommentIds?: string[];
            commentsCount?: number;
          };

          const postId = String(eventPayload.postId || "").trim();
          if (!postId) {
            return;
          }

          const effectiveDeletedCommentIds = (
            Array.isArray(eventPayload.deletedCommentIds) &&
            eventPayload.deletedCommentIds.length > 0
              ? eventPayload.deletedCommentIds
              : [eventPayload.commentId]
          ).filter(Boolean) as string[];

          queueSocialDeletedComments({
            postId,
            deletedCommentIds: effectiveDeletedCommentIds,
            commentsCount: eventPayload.commentsCount,
          });
        },
      });
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

      isRealtimeSnapshotResyncing = false;
      clearQueuedRealtimeDeltas();

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

    isRealtimeSnapshotResyncing = false;
    clearQueuedRealtimeDeltas();

    set({ onlineUsers: [], recentActiveUsers: {} });
  },
}));
