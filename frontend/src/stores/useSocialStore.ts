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
} from "@/types/social";

interface SocialState {
  homeFeed: SocialPost[];
  exploreFeed: SocialPost[];
  profilePosts: SocialPost[];
  profile: SocialProfile | null;
  notifications: SocialNotification[];
  postComments: Record<string, SocialComment[]>;
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
  fetchHomeFeed: (page?: number, append?: boolean) => Promise<void>;
  fetchExploreFeed: (page?: number, append?: boolean) => Promise<void>;
  fetchProfile: (userId: string) => Promise<boolean>;
  fetchProfilePosts: (
    userId: string,
    page?: number,
    append?: boolean,
  ) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  fetchComments: (postId: string) => Promise<void>;
  fetchPostEngagement: (postId: string) => Promise<void>;
  addComment: (postId: string, content: string) => Promise<void>;
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

const updatePostLike = (
  posts: SocialPost[],
  postId: string,
  liked: boolean,
  likesCount: number,
) =>
  posts.map((post) =>
    post._id === postId
      ? {
          ...post,
          isLiked: liked,
          likesCount,
        }
      : post,
  );

export const useSocialStore = create<SocialState>((set) => ({
  homeFeed: [],
  exploreFeed: [],
  profilePosts: [],
  profile: null,
  notifications: [],
  postComments: {},
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

  toggleLike: async (postId) => {
    try {
      const result = await socialService.toggleLikePost(postId);
      set((state) => ({
        homeFeed: updatePostLike(
          state.homeFeed,
          result.postId,
          result.liked,
          result.likesCount,
        ),
        exploreFeed: updatePostLike(
          state.exploreFeed,
          result.postId,
          result.liked,
          result.likesCount,
        ),
        profilePosts: updatePostLike(
          state.profilePosts,
          result.postId,
          result.liked,
          result.likesCount,
        ),
      }));
    } catch (error) {
      console.error("[social] toggleLike error", error);
      toast.error("Cannot like this post");
    }
  },

  fetchComments: async (postId) => {
    try {
      const result = await socialService.getCommentsByPost(postId);
      set((state) => ({
        postComments: {
          ...state.postComments,
          [postId]: result.comments,
        },
      }));
    } catch (error) {
      console.error("[social] fetchComments error", error);
      toast.error("Cannot load comments");
    }
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

  addComment: async (postId, content) => {
    try {
      const comment = await socialService.addComment(postId, { content });
      set((state) => ({
        postComments: {
          ...state.postComments,
          [postId]: [...(state.postComments[postId] || []), comment],
        },
        homeFeed: state.homeFeed.map((post) =>
          post._id === postId
            ? { ...post, commentsCount: post.commentsCount + 1 }
            : post,
        ),
        exploreFeed: state.exploreFeed.map((post) =>
          post._id === postId
            ? { ...post, commentsCount: post.commentsCount + 1 }
            : post,
        ),
        profilePosts: state.profilePosts.map((post) =>
          post._id === postId
            ? { ...post, commentsCount: post.commentsCount + 1 }
            : post,
        ),
      }));
    } catch (error) {
      console.error("[social] addComment error", error);
      toast.error("Cannot add comment");
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
