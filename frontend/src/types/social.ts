export interface SocialUserLite {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
}

export interface SocialPost {
  _id: string;
  authorId: SocialUserLite;
  caption: string;
  mediaUrls: string[];
  tags: string[];
  privacy: "public" | "followers";
  likesCount: number;
  commentsCount: number;
  isLiked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SocialComment {
  _id: string;
  postId: string;
  authorId: SocialUserLite;
  content: string;
  parentCommentId?: string | null;
  createdAt: string;
}

export interface SocialProfile {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
  isFriend?: boolean;
  canViewProfile: boolean;
}

export interface SocialPostEngagement {
  likers: SocialUserLite[];
  commenters: SocialUserLite[];
  recentComments: Array<{
    _id: string;
    authorId: SocialUserLite;
    content: string;
    createdAt: string;
  }>;
}

export interface SocialNotification {
  _id: string;
  recipientId: string;
  actorId: SocialUserLite;
  type: "follow" | "like" | "comment" | "system";
  postId?: string | null;
  commentId?: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PaginationPayload {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}
