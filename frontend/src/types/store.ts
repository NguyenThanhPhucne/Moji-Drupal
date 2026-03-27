import type { Socket } from "socket.io-client";
import type { Conversation, Message } from "./chat";
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
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

export interface ChatState {
  conversations: Conversation[];
  messages: Record<
    string,
    {
      items: Message[];
      hasMore: boolean; // infinite-scroll
      nextCursor?: string | null; // pagination cursor
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
  fetchMessages: (conversationId?: string) => Promise<void>;
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
  unsendMessage: (conversationId: string, messageId: string) => Promise<void>;
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
  deleteConversation: (conversationId: string) => Promise<boolean>;
}

export interface SocketState {
  socket: Socket | null;
  onlineUsers: string[];
  recentActiveUsers: Record<string, number>;
  isUserOnline: (userId?: string | null) => boolean;
  getUserPresence: (
    userId?: string | null,
  ) => "online" | "recently-active" | "offline";
  connectSocket: () => void;
  disconnectSocket: () => void;
}

export interface FriendState {
  friends: Friend[];
  loading: boolean;
  receivedList: FriendRequest[];
  sentList: FriendRequest[];
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
