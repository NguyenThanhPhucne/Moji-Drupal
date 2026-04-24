export interface SocialUserLite {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
}

export type SocialReactionType = "like" | "love" | "haha" | "wow" | "sad" | "angry";

export type SocialReactionSummary = Record<SocialReactionType, number>;

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
  ownReaction?: SocialReactionType | null;
  reactionSummary?: SocialReactionSummary;
  visibleReactors?: SocialUserLite[];
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
  isVerified?: boolean;
  role?: "admin" | "moderator" | "member" | "guest";
  isBanned?: boolean;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  friendCount?: number;
  friendsPreview?: SocialUserLite[];
  postCount: number;
  isFollowing: boolean;
  isFriend?: boolean;
  canViewProfile: boolean;
}

export interface SocialPostEngagement {
  likers: SocialUserLite[];
  commenters: SocialUserLite[];
  reactionBreakdown?: SocialReactionSummary;
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
  type: "follow" | "like" | "comment" | "mention" | "system" | "friend_accepted";
  postId?: string | null;
  conversationId?: string | null;
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
