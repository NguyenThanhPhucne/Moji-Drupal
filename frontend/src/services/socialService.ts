import api from "@/lib/axios";
import axios from "axios";
import type {
  PaginationPayload,
  SocialComment,
  SocialNotification,
  SocialReactionType,
  SocialReactionSummary,
  SocialPostEngagement,
  SocialPost,
  SocialProfile,
} from "@/types/social";

interface FeedResponse {
  posts: SocialPost[];
  pagination: PaginationPayload;
}

interface NotificationsResponse {
  notifications: SocialNotification[];
  unreadCount: number;
  pagination: PaginationPayload;
}

export const socialService = {
  createPost: async (payload: {
    caption: string;
    mediaUrls?: string[];
    tags?: string[];
    privacy?: "public" | "followers";
  }): Promise<SocialPost> => {
    const res = await api.post("/social/posts", payload);
    return res.data.post;
  },

  getHomeFeed: async (page = 1, limit = 15): Promise<FeedResponse> => {
    const res = await api.get("/social/feed/home", {
      params: { page, limit },
    });
    return res.data;
  },

  getExploreFeed: async (page = 1, limit = 15): Promise<FeedResponse> => {
    const res = await api.get("/social/feed/explore", {
      params: { page, limit },
    });
    return res.data;
  },

  getPostById: async (postId: string): Promise<SocialPost> => {
    const res = await api.get(`/social/posts/${postId}`);
    return res.data.post;
  },

  editPost: async (
    postId: string,
    payload: {
      caption?: string;
      tags?: string[];
      privacy?: "public" | "followers";
    },
  ): Promise<SocialPost> => {
    const res = await api.patch(`/social/posts/${postId}`, payload);
    return res.data.post;
  },

  getProfile: async (userId: string): Promise<SocialProfile> => {
    const res = await api.get(`/social/profiles/${userId}`);
    return res.data.profile;
  },

  getUserPosts: async (
    userId: string,
    page = 1,
    limit = 15,
  ): Promise<FeedResponse> => {
    const res = await api.get(`/social/profiles/${userId}/posts`, {
      params: { page, limit },
    });
    return res.data;
  },

  reactToPost: async (
    postId: string,
    reaction: SocialReactionType,
  ): Promise<{
    liked: boolean;
    ownReaction: SocialReactionType | null;
    likesCount: number;
    reactionSummary: SocialReactionSummary;
    postId: string;
  }> => {
    const res = await api.post(`/social/posts/${postId}/like`, { reaction });
    return res.data;
  },

  addComment: async (
    postId: string,
    payload: { content: string; parentCommentId?: string | null },
  ): Promise<SocialComment> => {
    const res = await api.post(`/social/posts/${postId}/comments`, payload);
    return res.data.comment;
  },

  getCommentsByPost: async (
    postId: string,
    page = 1,
    limit = 20,
    sort: "relevant" | "newest" = "relevant",
  ): Promise<{ comments: SocialComment[]; pagination: PaginationPayload }> => {
    const res = await api.get(`/social/posts/${postId}/comments`, {
      params: { page, limit, sort },
    });
    return res.data;
  },

  getPostEngagement: async (postId: string): Promise<SocialPostEngagement> => {
    try {
      const res = await api.get(`/social/posts/${postId}/engagement`);
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        const fallbackRes = await api.get(`/social/post/${postId}/engagement`);
        return fallbackRes.data;
      }
      throw error;
    }
  },

  toggleFollowUser: async (userId: string): Promise<{ following: boolean }> => {
    const res = await api.post(`/social/follows/${userId}/toggle`);
    return res.data;
  },

  getNotifications: async (
    page = 1,
    limit = 20,
  ): Promise<NotificationsResponse> => {
    const res = await api.get("/social/notifications", {
      params: { page, limit },
    });
    return res.data;
  },

  markNotificationRead: async (
    notificationId: string,
  ): Promise<{ notification: SocialNotification }> => {
    const res = await api.patch(`/social/notifications/${notificationId}/read`);
    return res.data;
  },

  markAllNotificationsRead: async (): Promise<{ ok: boolean }> => {
    const res = await api.patch("/social/notifications/read-all");
    return res.data;
  },
};
