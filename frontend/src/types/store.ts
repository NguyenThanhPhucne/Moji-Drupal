import type { Socket } from "socket.io-client";
import type {
  Conversation,
  GroupChannelAnalyticsPayload,
  GroupChannelRole,
  Message,
} from "./chat";
import type { Friend, FriendRequest, User } from "./user";

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  loading: boolean;

  setAccessToken: (accessToken: string) => void;
  setUser: (user: User) => void;
  clearState: () => void;
  signUp: (
    username: string,
    password: string,
    email: string,
    firstName: string,
    lastName: string,
  ) => Promise<void>;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  fetchMe: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface ThemeState {
  isDark: boolean;
  themeMode: "light" | "dark" | "system";
  accentColor: string;
  sidebarLayout: "full" | "compact";
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
  setThemeMode: (mode: "light" | "dark" | "system") => void;
  setAccentColor: (color: string) => void;
  setSidebarLayout: (layout: "full" | "compact") => void;
  applyTheme: () => void;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<
    string,
    {
      items: Message[];
      hasMore: boolean; // infinite-scroll
      nextCursor?: string | null; // pagination cursor
      channelId?: string | null;
    }
  >;
  activeConversationId: string | null;
  convoLoading: boolean;
  messageLoading: boolean;
  loading: boolean;
  replyingTo: Message | null;
  reset: () => void;

  setReplyingTo: (message: Message | null) => void;
  setActiveConversation: (id: string | null) => void;
  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId?: string, channelId?: string) => Promise<void>;
  sendDirectMessage: (
    recipientId: string,
    content: string,
    imgUrl?: string,
    conversationId?: string,
    replyTo?: string,
  ) => Promise<void>;
  sendGroupMessage: (
    conversationId: string,
    content: string,
    imgUrl?: string,
    replyTo?: string,
    groupChannelId?: string,
  ) => Promise<void>;
  // add message
  addMessage: (message: Message) => void;
  // modify message
  updateMessage: (
    conversationId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  reactToMessage: (
    conversationId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  unsendMessage: (
    conversationId: string,
    messageId: string,
    mode?: "standard" | "undo",
  ) => Promise<void>;
  removeMessageFromConversation: (
    conversationId: string,
    messageId: string,
  ) => void;
  removeMessageForMe: (
    conversationId: string,
    messageId: string,
  ) => Promise<void>;
  editMessage: (
    conversationId: string,
    messageId: string,
    content: string,
  ) => Promise<void>;
  // update convo
  updateConversation: (
    conversation: Partial<Conversation> & { _id: string },
  ) => void;
  markAsSeen: () => Promise<void>;
  addConvo: (convo: Conversation, options?: { setActive?: boolean }) => void;
  createConversation: (
    type: "group" | "direct",
    name: string,
    memberIds: string[],
  ) => Promise<boolean>;
  setGroupAnnouncementMode: (
    conversationId: string,
    enabled: boolean,
  ) => Promise<boolean>;
  setGroupAdminRole: (
    conversationId: string,
    memberId: string,
    makeAdmin: boolean,
  ) => Promise<boolean>;
  createGroupChannel: (
    conversationId: string,
    name: string,
    description?: string,
    options?: {
      categoryId?: string | null;
      sendRoles?: GroupChannelRole[];
      position?: number;
    },
  ) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  updateGroupChannel: (
    conversationId: string,
    channelId: string,
    payload: {
      name?: string;
      description?: string;
      categoryId?: string | null;
      sendRoles?: GroupChannelRole[];
    },
  ) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  deleteGroupChannel: (
    conversationId: string,
    channelId: string,
  ) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  reorderGroupChannels: (
    conversationId: string,
    channelIds: string[],
  ) => Promise<boolean>;
  createGroupChannelCategory: (
    conversationId: string,
    name: string,
    position?: number,
  ) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  updateGroupChannelCategory: (
    conversationId: string,
    categoryId: string,
    payload: {
      name?: string;
    },
  ) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  deleteGroupChannelCategory: (
    conversationId: string,
    categoryId: string,
  ) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  reorderGroupChannelCategories: (
    conversationId: string,
    categoryIds: string[],
  ) => Promise<boolean>;
  fetchGroupChannelAnalytics: (
    conversationId: string,
    days?: number,
  ) => Promise<{
    ok: boolean;
    analytics?: GroupChannelAnalyticsPayload;
    message?: string;
  }>;
  setGroupActiveChannel: (
    conversationId: string,
    channelId: string,
  ) => Promise<boolean>;
  createGroupJoinLink: (
    conversationId: string,
    options?: {
      expiresInHours?: number;
      maxUses?: number | null;
      oneTime?: boolean;
    },
  ) => Promise<{
    ok: boolean;
    joinLinkUrl?: string;
    expiresAt?: string;
    maxUses?: number | null;
    oneTime?: boolean;
    remainingUses?: number | null;
    message?: string;
    retryAfterSeconds?: number;
  }>;
  revokeGroupJoinLink: (conversationId: string) => Promise<boolean>;
  joinGroupByLink: (
    conversationId: string,
    token: string,
  ) => Promise<{
    ok: boolean;
    alreadyJoined?: boolean;
    message?: string;
    retryAfterSeconds?: number;
  }>;
  pinGroupMessage: (
    conversationId: string,
    messageId?: string | null,
  ) => Promise<boolean>;
  deleteConversation: (conversationId: string) => Promise<boolean>;
  forwardMessage: (
    messageId: string,
    recipientIds: string[],
    groupIds: string[],
  ) => Promise<{ ok: boolean; message?: string }>;
  toggleMessageForwardable: (
    messageId: string,
    isForwardable: boolean,
  ) => Promise<{ ok: boolean }>;
}

export interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  recentActiveUsers: Record<string, number>;
  lastActiveByUser: Record<string, number>;
  isUserOnline: (userId?: string | null) => boolean;
  getUserPresence: (
    userId?: string | null,
  ) => "online" | "recently-active" | "offline";
  getLastActiveAt: (userId?: string | null) => number | null;
  connectSocket: () => void;
  disconnectSocket: () => void;
}

export interface FriendState {
  friends: Friend[];
  loading: boolean;
  receivedList: FriendRequest[];
  sentList: FriendRequest[];
  seenRequests: string[];
  markRequestSeen: (requestId: string) => void;
  addReceivedRequest: (request: FriendRequest) => void;
  removeReceivedRequest: (requestId: string) => void;
  searchByUsername: (username: string) => Promise<User | null>;
  addFriend: (to: string, message?: string) => Promise<string>;
  getAllFriendRequests: () => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  getFriends: () => Promise<void>;
  removeFriend: (friendId: string) => Promise<{ ok: boolean; message: string }>;
}

export interface UserState {
  updateAvatarUrl: (formData: FormData) => Promise<void>;
}
