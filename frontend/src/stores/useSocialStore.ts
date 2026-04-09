import { create } from "zustand";
import { toast } from "sonner";
import axios from "axios";
import { socialService } from "@/services/socialService";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import type {
  PaginationPayload,
  SocialComment,
  SocialNotification,
  SocialPostEngagement,
  SocialPost,
  SocialProfile,
  SocialReactionType,
} from "@/types/social";

const getSocialErrorMessage = (error: unknown, fallback: string) => {
  const maybeAxios = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };

  return maybeAxios?.response?.data?.message || maybeAxios?.message || fallback;
};

interface SocialState {
  homeFeed: SocialPost[];
  exploreFeed: SocialPost[];
  profilePosts: SocialPost[];
  profile: SocialProfile | null;
  notifications: SocialNotification[];
  postComments: Record<string, SocialComment[]>;
  postCommentsPagination: Record<string, PaginationPayload>;
  postCommentsSortBy: Record<string, "relevant" | "newest">;
  loadingCommentsByPost: Record<string, boolean>;
  postEngagement: Record<string, SocialPostEngagement>;
  profileAccessDenied: boolean;
  homePagination: PaginationPayload;
  explorePagination: PaginationPayload;
  profilePagination: PaginationPayload;
  loadingHome: boolean;
  loadingExplore: boolean;
  loadingProfile: boolean;
  loadingNotifications: boolean;
  createPost: (payload: {
    caption: string;
    mediaUrls?: string[];
    tags?: string[];
    privacy?: "public" | "followers";
  }) => Promise<boolean>;
  deletePost: (postId: string) => Promise<boolean>;
  fetchHomeFeed: (page?: number, append?: boolean) => Promise<void>;
  fetchExploreFeed: (page?: number, append?: boolean) => Promise<void>;
  fetchProfile: (userId: string) => Promise<boolean>;
  fetchProfilePosts: (
    userId: string,
    page?: number,
    append?: boolean,
  ) => Promise<void>;
  toggleLike: (postId: string, reaction?: SocialReactionType) => Promise<boolean>;
  fetchComments: (
    postId: string,
    page?: number,
    append?: boolean,
    sortBy?: "relevant" | "newest",
  ) => Promise<void>;
  loadMoreComments: (postId: string) => Promise<void>;
  setCommentsSortBy: (
    postId: string,
    sortBy: "relevant" | "newest",
  ) => Promise<void>;
  fetchPostEngagement: (postId: string) => Promise<void>;
  addComment: (
    postId: string,
    content: string,
    parentCommentId?: string | null,
  ) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => Promise<number>;
  toggleFollow: (userId: string) => Promise<boolean>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const DEFAULT_PAGINATION: PaginationPayload = {
  page: 1,
  limit: 15,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
};


export const useSocialStore = create<SocialState>((set) => ({
  homeFeed: [],
  exploreFeed: [],
  profilePosts: [],
  profile: null,
  notifications: [],
  postComments: {},
  postCommentsPagination: {},
  postCommentsSortBy: {},
  loadingCommentsByPost: {},
  postEngagement: {},
  profileAccessDenied: false,
  homePagination: DEFAULT_PAGINATION,
  explorePagination: DEFAULT_PAGINATION,
  profilePagination: DEFAULT_PAGINATION,
  loadingHome: false,
  loadingExplore: false,
  loadingProfile: false,
  loadingNotifications: false,

  createPost: async (payload) => {
    try {
      const post = await socialService.createPost(payload);
      set((state) => ({
        homeFeed: [post, ...state.homeFeed],
        profilePosts:
          state.profilePosts.length > 0
            ? [post, ...state.profilePosts]
            : state.profilePosts,
        profile: state.profile
          ? {
              ...state.profile,
              postCount: state.profile.postCount + 1,
            }
          : state.profile,
      }));
      return true;
    } catch (error) {
      console.error("[social] createPost error", error);
      toast.error("Cannot create post right now");
      return false;
    }
  },

  deletePost: async (postId) => {
    const previousState = {
      homeFeed: useSocialStore.getState().homeFeed,
      exploreFeed: useSocialStore.getState().exploreFeed,
      profilePosts: useSocialStore.getState().profilePosts,
      profile: useSocialStore.getState().profile,
      postComments: useSocialStore.getState().postComments,
      postCommentsPagination: useSocialStore.getState().postCommentsPagination,
      postEngagement: useSocialStore.getState().postEngagement,
    };

    set((state) => {
      const removePost = (posts: SocialPost[]) => posts.filter((post) => post._id !== postId);
      const nextProfile =
        state.profile && state.profile.postCount > 0
          ? { ...state.profile, postCount: state.profile.postCount - 1 }
          : state.profile;

      const nextPostComments = { ...state.postComments };
      delete nextPostComments[postId];

      const nextPostCommentsPagination = { ...state.postCommentsPagination };
      delete nextPostCommentsPagination[postId];

      const nextPostEngagement = { ...state.postEngagement };
      delete nextPostEngagement[postId];

      return {
        homeFeed: removePost(state.homeFeed),
        exploreFeed: removePost(state.exploreFeed),
        profilePosts: removePost(state.profilePosts),
        profile: nextProfile,
        postComments: nextPostComments,
        postCommentsPagination: nextPostCommentsPagination,
        postEngagement: nextPostEngagement,
      };
    });

    try {
      await socialService.deletePost(postId);
      toast.success("Post deleted");
      return true;
    } catch (error) {
      set(previousState);
      console.error("[social] deletePost error", error);
      toast.error(getSocialErrorMessage(error, "Cannot delete this post"));
      return false;
    }
  },

  fetchHomeFeed: async (page = 1, append = false) => {
    try {
      set({ loadingHome: true });
      const result = await socialService.getHomeFeed(page);
      set((state) => ({
        homeFeed: append ? [...state.homeFeed, ...result.posts] : result.posts,
        homePagination: result.pagination,
      }));
    } catch (error) {
      console.error("[social] fetchHomeFeed error", error);
      toast.error("Cannot load home feed");
    } finally {
      set({ loadingHome: false });
    }
  },

  fetchExploreFeed: async (page = 1, append = false) => {
    try {
      set({ loadingExplore: true });
      const result = await socialService.getExploreFeed(page);
      set((state) => ({
        exploreFeed: append
          ? [...state.exploreFeed, ...result.posts]
          : result.posts,
        explorePagination: result.pagination,
      }));
    } catch (error) {
      console.error("[social] fetchExploreFeed error", error);
      toast.error("Cannot load explore feed");
    } finally {
      set({ loadingExplore: false });
    }
  },

  fetchProfile: async (userId) => {
    try {
      set({ loadingProfile: true });
      const profile = await socialService.getProfile(userId);
      const viewerId = useAuthStore.getState().user?._id;
      const isSelf = viewerId
        ? String(profile._id) === String(viewerId)
        : false;
      const fallbackCanView = isSelf || Boolean(profile.isFriend);
      const canViewProfile =
        typeof profile.canViewProfile === "boolean"
          ? profile.canViewProfile
          : fallbackCanView;
      if (canViewProfile) {
        set({ profile, profileAccessDenied: false });
      } else {
        set({
          profile,
          profileAccessDenied: true,
          profilePosts: [],
          profilePagination: DEFAULT_PAGINATION,
        });
      }
      return canViewProfile;
    } catch (error) {
      console.error("[social] fetchProfile error", error);
      toast.error("Cannot load profile");
      return false;
    } finally {
      set({ loadingProfile: false });
    }
  },

  fetchProfilePosts: async (userId, page = 1, append = false) => {
    try {
      set({ loadingProfile: true });
      const result = await socialService.getUserPosts(userId, page);
      set((state) => ({
        profilePosts: append
          ? [...state.profilePosts, ...result.posts]
          : result.posts,
        profilePagination: result.pagination,
      }));
    } catch (error) {
      console.error("[social] fetchProfilePosts error", error);
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        set({ profileAccessDenied: true, profilePosts: [] });
      } else {
        toast.error("Cannot load profile posts");
      }
    } finally {
      set({ loadingProfile: false });
    }
  },

  toggleLike: async (postId, reaction = "like") => {
    const currentState = useSocialStore.getState();

    // ── Snapshot for rollback ────────────────────────────────────────────
    const previousHomeFeed = currentState.homeFeed;
    const previousExploreFeed = currentState.exploreFeed;
    const previousProfilePosts = currentState.profilePosts;

    // ── Derive next state optimistically ────────────────────────────────
    const applyOptimistic = (posts: SocialPost[]) =>
      posts.map((post) => {
        if (post._id !== postId) return post;

        const prevReaction = post.ownReaction ?? null;
        const nextReaction = prevReaction === reaction ? null : reaction;

        // Build new reaction summary
        const prevSummary = { ...(post.reactionSummary ?? { like: post.likesCount || 0, love: 0, haha: 0, wow: 0, sad: 0, angry: 0 }) };
        if (prevReaction && prevSummary[prevReaction] !== undefined) {
          prevSummary[prevReaction] = Math.max(0, prevSummary[prevReaction] - 1);
        }
        if (nextReaction) {
          prevSummary[nextReaction] = (prevSummary[nextReaction] || 0) + 1;
        }
        const nextLikesCount = Object.values(prevSummary).reduce((sum, v) => sum + v, 0);

        return {
          ...post,
          ownReaction: nextReaction,
          isLiked: nextReaction === "like",
          reactionSummary: prevSummary,
          likesCount: nextLikesCount,
        };
      });

    // Apply optimistic update immediately
    set({
      homeFeed: applyOptimistic(previousHomeFeed),
      exploreFeed: applyOptimistic(previousExploreFeed),
      profilePosts: applyOptimistic(previousProfilePosts),
    });

    try {
      const result = await socialService.reactToPost(postId, reaction);
      // Reconcile with authoritative server response
      const reconcile = (posts: SocialPost[]) =>
        posts.map((post) =>
          post._id === result.postId
            ? {
                ...post,
                ownReaction: result.ownReaction,
                isLiked: result.ownReaction === "like",
                likesCount: result.likesCount,
                reactionSummary: result.reactionSummary,
              }
            : post,
        );
      set({
        homeFeed: reconcile(useSocialStore.getState().homeFeed),
        exploreFeed: reconcile(useSocialStore.getState().exploreFeed),
        profilePosts: reconcile(useSocialStore.getState().profilePosts),
      });
      return true;
    } catch (error) {
      // Full rollback on failure
      set({
        homeFeed: previousHomeFeed,
        exploreFeed: previousExploreFeed,
        profilePosts: previousProfilePosts,
      });
      console.error("[social] toggleLike error", error);
      toast.error(getSocialErrorMessage(error, "Cannot react to this post"));
      return false;
    }
  },

  fetchComments: async (
    postId,
    page = 1,
    append = false,
    sortBy,
  ) => {
    try {
      set((state) => ({
        loadingCommentsByPost: {
          ...state.loadingCommentsByPost,
          [postId]: true,
        },
      }));

      const currentSortBy =
        sortBy || useSocialStore.getState().postCommentsSortBy[postId] || "relevant";

      const result = await socialService.getCommentsByPost(
        postId,
        page,
        20,
        currentSortBy,
      );
      set((state) => ({
        postComments: {
          ...state.postComments,
          [postId]: append
            ? [...(state.postComments[postId] || []), ...result.comments]
            : result.comments,
        },
        postCommentsPagination: {
          ...state.postCommentsPagination,
          [postId]: result.pagination,
        },
        postCommentsSortBy: {
          ...state.postCommentsSortBy,
          [postId]: currentSortBy,
        },
      }));
    } catch (error) {
      console.error("[social] fetchComments error", error);
      toast.error("Cannot load comments");
    } finally {
      set((state) => ({
        loadingCommentsByPost: {
          ...state.loadingCommentsByPost,
          [postId]: false,
        },
      }));
    }
  },

  loadMoreComments: async (postId) => {
    const state = useSocialStore.getState();
    const currentPagination = state.postCommentsPagination[postId];
    if (!currentPagination?.hasNextPage || state.loadingCommentsByPost[postId]) {
      return;
    }

    await state.fetchComments(postId, currentPagination.page + 1, true);
  },

  setCommentsSortBy: async (postId, sortBy) => {
    await useSocialStore.getState().fetchComments(postId, 1, false, sortBy);
  },

  fetchPostEngagement: async (postId) => {
    try {
      const result = await socialService.getPostEngagement(postId);
      set((state) => ({
        postEngagement: {
          ...state.postEngagement,
          [postId]: result,
        },
      }));
    } catch (error) {
      console.error("[social] fetchPostEngagement error", error);
      toast.error("Cannot load likes and commenters");
    }
  },

  addComment: async (postId, content, parentCommentId = null) => {
    try {
      const comment = await socialService.addComment(postId, {
        content,
        parentCommentId,
      });
      set((state) => ({
        postComments: (() => {
          const existing = state.postComments[postId] || [];
          const alreadyExists = existing.some(
            (commentItem) => commentItem._id === comment._id,
          );

          return {
            ...state.postComments,
            [postId]: alreadyExists ? existing : [...existing, comment],
          };
        })(),
        postCommentsPagination: (() => {
          const current = state.postCommentsPagination[postId];
          if (!current) {
            return state.postCommentsPagination;
          }

          return {
            ...state.postCommentsPagination,
            [postId]: {
              ...current,
              total: current.total + 1,
            },
          };
        })(),
        homeFeed: state.homeFeed.map((post) => {
          if (post._id !== postId) {
            return post;
          }

          const existing = state.postComments[postId] || [];
          const alreadyExists = existing.some(
            (commentItem) => commentItem._id === comment._id,
          );

          return {
            ...post,
            commentsCount: alreadyExists
              ? post.commentsCount
              : post.commentsCount + 1,
          };
        }),
        exploreFeed: state.exploreFeed.map((post) => {
          if (post._id !== postId) {
            return post;
          }

          const existing = state.postComments[postId] || [];
          const alreadyExists = existing.some(
            (commentItem) => commentItem._id === comment._id,
          );

          return {
            ...post,
            commentsCount: alreadyExists
              ? post.commentsCount
              : post.commentsCount + 1,
          };
        }),
        profilePosts: state.profilePosts.map((post) => {
          if (post._id !== postId) {
            return post;
          }

          const existing = state.postComments[postId] || [];
          const alreadyExists = existing.some(
            (commentItem) => commentItem._id === comment._id,
          );

          return {
            ...post,
            commentsCount: alreadyExists
              ? post.commentsCount
              : post.commentsCount + 1,
          };
        }),
      }));
      return true;
    } catch (error) {
      console.error("[social] addComment error", error);
      toast.error("Cannot add comment");
      return false;
    }
  },

  deleteComment: async (postId, commentId) => {
    const previousState = {
      postComments: useSocialStore.getState().postComments,
      postCommentsPagination: useSocialStore.getState().postCommentsPagination,
      homeFeed: useSocialStore.getState().homeFeed,
      exploreFeed: useSocialStore.getState().exploreFeed,
      profilePosts: useSocialStore.getState().profilePosts,
    };

    let optimisticDeletedCount = 0;
    const targetComments = previousState.postComments[postId] || [];
    if (targetComments.some((item) => item._id === commentId)) {
      const queue = [commentId];
      const removed = new Set<string>();

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || removed.has(current)) {
          continue;
        }

        removed.add(current);

        targetComments.forEach((comment) => {
          if (String(comment.parentCommentId || "") === current) {
            queue.push(comment._id);
          }
        });
      }

      optimisticDeletedCount = removed.size;
      const nextComments = targetComments.filter((item) => !removed.has(item._id));

      set((state) => {
        const applyCount = (post: SocialPost) =>
          post._id === postId
            ? { ...post, commentsCount: Math.max(0, post.commentsCount - optimisticDeletedCount) }
            : post;

        return {
          postComments: {
            ...state.postComments,
            [postId]: nextComments,
          },
          postCommentsPagination: {
            ...state.postCommentsPagination,
            [postId]: state.postCommentsPagination[postId]
              ? {
                  ...state.postCommentsPagination[postId],
                  total: Math.max(
                    0,
                    state.postCommentsPagination[postId].total - optimisticDeletedCount,
                  ),
                }
              : state.postCommentsPagination[postId],
          },
          homeFeed: state.homeFeed.map(applyCount),
          exploreFeed: state.exploreFeed.map(applyCount),
          profilePosts: state.profilePosts.map(applyCount),
        };
      });
    }

    try {
      const response = await socialService.deleteComment(postId, commentId);
      const deletedCount = Number(response.deletedCount || optimisticDeletedCount || 1);

      if (deletedCount !== optimisticDeletedCount && optimisticDeletedCount > 0) {
        const delta = deletedCount - optimisticDeletedCount;
        if (delta !== 0) {
          set((state) => {
            const applyCount = (post: SocialPost) =>
              post._id === postId
                ? { ...post, commentsCount: Math.max(0, post.commentsCount - delta) }
                : post;

            return {
              homeFeed: state.homeFeed.map(applyCount),
              exploreFeed: state.exploreFeed.map(applyCount),
              profilePosts: state.profilePosts.map(applyCount),
            };
          });
        }
      }

      return deletedCount;
    } catch (error) {
      set(previousState);
      console.error("[social] deleteComment error", error);
      toast.error(getSocialErrorMessage(error, "Cannot delete this comment"));
      return 0;
    }
  },

  toggleFollow: async (userId) => {
    try {
      const result = await socialService.toggleFollowUser(userId);
      set((state) => ({
        profile:
          state.profile?._id === userId
            ? {
                ...state.profile,
                isFollowing: result.following,
                followerCount: Math.max(
                  0,
                  state.profile.followerCount + (result.following ? 1 : -1),
                ),
              }
            : state.profile,
      }));
      return result.following;
    } catch (error) {
      console.error("[social] toggleFollow error", error);
      toast.error("Cannot update follow status");
      return false;
    }
  },

  fetchNotifications: async () => {
    try {
      set({ loadingNotifications: true });
      const result = await socialService.getNotifications();
      set({ notifications: result.notifications });
      useNotificationStore
        .getState()
        .setSocialNotifications(result.notifications);
    } catch (error) {
      console.error("[social] fetchNotifications error", error);
    } finally {
      set({ loadingNotifications: false });
    }
  },

  markNotificationRead: async (notificationId) => {
    try {
      await socialService.markNotificationRead(notificationId);
      set((state) => ({
        notifications: state.notifications.map((notification) =>
          notification._id === notificationId
            ? { ...notification, isRead: true }
            : notification,
        ),
      }));
      useNotificationStore
        .getState()
        .markSocialNotificationRead(notificationId);
    } catch (error) {
      console.error("[social] markNotificationRead error", error);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      await socialService.markAllNotificationsRead();
      set((state) => ({
        notifications: state.notifications.map((notification) => ({
          ...notification,
          isRead: true,
        })),
      }));
      useNotificationStore.getState().markAllSocialNotificationsRead();
    } catch (error) {
      console.error("[social] markAllNotificationsRead error", error);
    }
  },
}));
