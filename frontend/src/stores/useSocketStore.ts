import { create } from "zustand";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./useAuthStore";
import type { SocketState } from "@/types/store";
import { useChatStore } from "./useChatStore";
import { useFriendStore } from "./useFriendStore";
import { useNotificationStore } from "./useNotificationStore";
import { useSocialStore } from "./useSocialStore";
import { toast } from "sonner";
import type {
  SocialComment,
  SocialPost,
  SocialReactionSummary,
  SocialReactionType,
  SocialUserLite,
} from "@/types/social";

const SOCIAL_BURST_DEBOUNCE_MS = 90;

let socialBurstTimer: ReturnType<typeof setTimeout> | null = null;

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

const scheduleSocialBurstFlush = () => {
  if (socialBurstTimer) {
    return;
  }

  socialBurstTimer = setTimeout(() => {
    socialBurstTimer = null;

    const likeUpdates = new Map(pendingLikeUpdates);
    const commentUpdates = new Map(pendingCommentUpdates);
    const createdPosts = Array.from(pendingCreatedPosts.values());
    const updatedPosts = new Map(pendingUpdatedPosts);

    pendingLikeUpdates.clear();
    pendingCommentUpdates.clear();
    pendingCreatedPosts.clear();
    pendingUpdatedPosts.clear();

    if (
      likeUpdates.size === 0 &&
      commentUpdates.size === 0 &&
      createdPosts.length === 0 &&
      updatedPosts.size === 0
    ) {
      return;
    }

    useSocialStore.setState((state) => {
      const currentUserId = String(useAuthStore.getState().user?._id || "");

      const applyPostMutations = (posts: SocialPost[], listType: "home" | "explore" | "profile") => {
        const createdCandidates = createdPosts.filter((post) => {
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
            return String(state.profile?._id || "") === String(post.authorId?._id || "");
          }

          return true;
        });

        let nextPosts = [...createdCandidates, ...posts];

        if (updatedPosts.size > 0) {
          nextPosts = nextPosts.map((post) => {
            const updated = updatedPosts.get(post._id);
            return updated ? { ...post, ...updated } : post;
          });
        }

        if (likeUpdates.size > 0) {
          nextPosts = nextPosts.map((post) => {
            const likeUpdate = likeUpdates.get(post._id);
            if (!likeUpdate) {
              return post;
            }

            const actorId = String(likeUpdate.actor?._id || "");
            const shouldApplyIsLiked = Boolean(currentUserId) && actorId === currentUserId;

            return {
              ...post,
              likesCount: likeUpdate.likesCount,
              ownReaction: shouldApplyIsLiked
                ? likeUpdate.ownReaction
                : post.ownReaction,
              isLiked: shouldApplyIsLiked
                ? likeUpdate.ownReaction === "like"
                : post.isLiked,
              reactionSummary: likeUpdate.reactionSummary || post.reactionSummary,
            };
          });
        }

        if (commentUpdates.size > 0) {
          nextPosts = nextPosts.map((post) => {
            const commentUpdate = commentUpdates.get(post._id);
            if (!commentUpdate) {
              return post;
            }

            return {
              ...post,
              commentsCount:
                typeof commentUpdate.commentsCount === "number"
                  ? commentUpdate.commentsCount
                  : post.commentsCount,
            };
          });
        }

        return nextPosts;
      };

      const nextPostComments = { ...state.postComments };
      commentUpdates.forEach((commentUpdate, postId) => {
        const mergedComments = [...(nextPostComments[postId] || [])];
        commentUpdate.comments.forEach((incomingComment) => {
          if (!mergedComments.some((comment) => comment._id === incomingComment._id)) {
            mergedComments.push(incomingComment);
          }
        });
        nextPostComments[postId] = mergedComments;
      });

      const nextPostEngagement = { ...state.postEngagement };

      likeUpdates.forEach((likeUpdate, postId) => {
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
            nextLikers = nextLikers.filter(
              (liker) => String(liker._id) !== actorId,
            );
          }
        }

        nextPostEngagement[postId] = {
          ...currentEngagement,
          likers: nextLikers,
        };
      });

      commentUpdates.forEach((commentUpdate, postId) => {
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

      return {
        homeFeed: applyPostMutations(state.homeFeed, "home"),
        exploreFeed: applyPostMutations(state.exploreFeed, "explore"),
        profilePosts: applyPostMutations(state.profilePosts, "profile"),
        profile:
          state.profile &&
          createdPosts.some(
            (post) => String(post.authorId?._id || "") === String(state.profile?._id || ""),
          )
            ? {
                ...state.profile,
                postCount: state.profile.postCount + createdPosts.filter(
                  (post) => String(post.authorId?._id || "") === String(state.profile?._id || ""),
                ).length,
              }
            : state.profile,
        postComments: nextPostComments,
        postEngagement: nextPostEngagement,
      };
    });
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
      ({ conversationId, messageId, content, editedAt, conversation }) => {
        const chatState = useChatStore.getState();
        const currentMessage = chatState.messages?.[conversationId]?.items?.find(
          (messageItem) => messageItem._id === messageId,
        );

        if (currentMessage?.isDeleted) {
          return;
        }

        const incomingEditedAtTs = editedAt ? new Date(editedAt).getTime() : 0;
        const currentEditedAtTs = currentMessage?.editedAt
          ? new Date(currentMessage.editedAt).getTime()
          : 0;

        if (incomingEditedAtTs && currentEditedAtTs && incomingEditedAtTs < currentEditedAtTs) {
          return;
        }

        useChatStore
          .getState()
          .updateMessage(conversationId, messageId, { content, editedAt });

        if (conversation?._id) {
          useChatStore.getState().updateConversation(conversation);
        }
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

    socket.on(
      "social-post-like-updated",
      ({ postId, likesCount, reactionType, reactionSummary, actor }: {
        postId: string;
        likesCount: number;
        reactionType: SocialReactionType | null;
        reactionSummary?: SocialReactionSummary;
        actor?: SocialUserLite;
      }) => {
        if (!postId || typeof likesCount !== "number") {
          return;
        }

        queueSocialLikeUpdate({
          postId,
          likesCount,
          ownReaction: reactionType,
          reactionSummary,
          actor,
        });
      },
    );

    socket.on(
      "social-post-comment-added",
      ({ postId, comment, commentsCount }: {
        postId: string;
        comment: SocialComment;
        commentsCount?: number;
      }) => {
        if (!postId || !comment?._id) {
          return;
        }

        queueSocialCommentUpdate({ postId, comment, commentsCount });
      },
    );

    socket.on("social-post-created", ({ post }: { post: SocialPost }) => {
      if (!post?._id) {
        return;
      }

      queueSocialCreatedPost(post);
    });

    socket.on("social-post-updated", ({ post }: { post: SocialPost }) => {
      if (!post?._id) {
        return;
      }

      queueSocialUpdatedPost(post);
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
