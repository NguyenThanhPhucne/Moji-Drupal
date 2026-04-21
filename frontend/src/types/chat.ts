export interface Participant {
  _id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string | null;
  bio?: string;
  joinedAt: string;
}

export interface SeenUser {
  _id: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface GroupJoinLinkMeta {
  expiresAt: string;
  createdAt?: string | null;
  createdBy?: string | null;
  maxUses?: number | null;
  useCount?: number;
  remainingUses?: number | null;
  oneTime?: boolean;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  isActive: boolean;
}

export type GroupChannelRole = "owner" | "admin" | "member";

export interface GroupChannelPermissions {
  sendRoles: GroupChannelRole[];
}

export interface GroupChannelCategoryMeta {
  categoryId: string;
  name: string;
  position: number;
  createdAt?: string | null;
  createdBy?: string | null;
}

export interface GroupChannelMeta {
  channelId: string;
  name: string;
  description?: string;
  categoryId?: string | null;
  position?: number;
  permissions?: GroupChannelPermissions;
  createdAt?: string | null;
  createdBy?: string | null;
}

export interface Group {
  name: string;
  createdBy: string;
  adminIds?: string[];
  announcementOnly?: boolean;
  channels?: GroupChannelMeta[];
  channelCategories?: GroupChannelCategoryMeta[];
  channelUnreadCounts?: Record<string, Record<string, number>>;
  activeChannelId?: string;
  joinLink?: GroupJoinLinkMeta | null;
}

export interface PinnedMessageMeta {
  _id: string;
  content?: string | null;
  imgUrl?: string | null;
  senderId: string;
  createdAt: string;
  pinnedAt?: string | null;
  pinnedBy?: string | null;
}

export interface LastMessage {
  _id: string;
  content: string;
  createdAt: string;
  groupChannelId?: string | null;
  sender: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
}

export interface GroupChannelAnalyticsItem {
  channelId: string;
  name: string;
  categoryId?: string | null;
  position?: number;
  currentMessages: number;
  previousMessages: number;
  messageGrowthPercent: number;
  currentActiveSenders: number;
  senderRetentionPercent: number;
}

export interface GroupChannelAnalyticsSummary {
  membersCount: number;
  currentMessages: number;
  previousMessages: number;
  currentActiveMembers: number;
  previousActiveMembers: number;
  currentRetentionRate: number;
  previousRetentionRate: number;
  retentionDelta: number;
}

export interface GroupChannelAnalyticsPayload {
  conversationId: string;
  rangeDays: number;
  period: {
    currentStart: string;
    currentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  summary: GroupChannelAnalyticsSummary;
  channels: GroupChannelAnalyticsItem[];
}

export interface Conversation {
  _id: string;
  type: "direct" | "group";
  group: Group;
  pinnedMessage?: PinnedMessageMeta | null;
  participants: Participant[];
  lastMessageAt: string;
  seenBy: SeenUser[];
  lastMessage: LastMessage | null;
  unreadCounts: Record<string, number>; // key = userId, value = unread count
  createdAt: string;
  updatedAt: string;
}

export interface ConversationResponse {
  conversations: Conversation[];
}

export interface Reaction {
  userId: string;
  emoji: string;
}

export type MessageDeliveryState = "sending" | "queued" | "failed";

export interface Message {
  _id: string;
  conversationId: string;
  groupChannelId?: string | null;
  senderId: string;
  senderDisplayName?: string;
  content: string | null;
  imgUrl?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  isOwn?: boolean;
  replyTo?: {
    _id: string;
    content: string;
    senderId: string;
    senderDisplayName?: string;
  } | null;
  reactions?: Reaction[];
  isDeleted?: boolean;
  editedAt?: string | null;
  readBy?: string[];
  hiddenFor?: string[];
  isForwardable?: boolean;
  forwardedFrom?: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  } | null;
  deliveryState?: MessageDeliveryState;
  deliveryError?: string | null;
  deliveryAttemptCount?: number;
}

export interface ProfileLite {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string;
  lastActiveAt?: string | null;
  mutualGroupsCount: number;
  mutualGroups: Array<{
    _id: string;
    name: string;
  }>;
}

export interface SavedBookmark {
  _id: string;
  createdAt: string;
  note?: string;
  tags?: string[];
  collections?: string[];
  messageId: {
    _id: string;
    conversationId: string;
    senderId: string;
    content: string | null;
    imgUrl?: string | null;
    createdAt: string;
    isDeleted?: boolean;
  };
  conversationId: Conversation;
}

export interface BookmarkPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface GlobalSearchPerson {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string;
  lastActiveAt?: string | null;
  mutualGroupsCount: number;
  conversationId?: string | null;
  score: number;
}

export interface GlobalSearchGroup {
  conversationId: string;
  name: string;
  membersCount: number;
  score: number;
}

export interface GlobalSearchMessage {
  messageId: string;
  conversationId: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  score: number;
}

export interface GlobalSearchPost {
  postId: string;
  caption: string;
  preview: string;
  authorId: string;
  authorName: string;
  mediaCount: number;
  createdAt: string;
  score: number;
}

export interface GlobalSearchResponse {
  people: GlobalSearchPerson[];
  groups: GlobalSearchGroup[];
  messages: GlobalSearchMessage[];
  posts: GlobalSearchPost[];
}
