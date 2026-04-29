import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import {
  ArrowRight,
  Clock3,
  MessageCircle,
  MessageSquareDashed,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useMemo, useState } from "react";
import NewGroupChatModal from "./NewGroupChatModal";
import { Dialog } from "../ui/dialog";
import { useFriendStore } from "@/stores/useFriendStore";
import FriendListModal from "../createNewChat/FriendListModal";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn, formatOnlineTime } from "@/lib/utils";
import type { Conversation } from "@/types/chat";

const toConversationTimestamp = (conversation: {
  lastMessage?: { createdAt?: string } | null;
  updatedAt?: string;
  createdAt?: string;
}) => {
  const candidate =
    conversation.lastMessage?.createdAt ||
    conversation.updatedAt ||
    conversation.createdAt ||
    "";

  const ts = Date.parse(String(candidate));
  return Number.isFinite(ts) ? ts : 0;
};

type LastMessageLite = {
  content?: string | null;
  imgUrl?: string | null;
  audioUrl?: string | null;
  senderId?: string | null;
  sender?: {
    _id?: string | null;
    displayName?: string | null;
  } | null;
};

const formatUnreadBadge = (count: number) => {
  if (count > 99) {
    return "99+";
  }

  return String(Math.max(0, count));
};

const resolveConversationDisplayName = (
  conversation: Conversation,
  currentUserId: string,
) => {
  if (conversation.type === "group") {
    return String(conversation.group?.name || "Group conversation");
  }

  const peer = conversation.participants.find(
    (participant) => String(participant._id) !== currentUserId,
  );

  return String(peer?.displayName || "Direct conversation");
};

const resolveConversationPreview = (
  conversation: Conversation,
  currentUserId: string,
) => {
  const lastMessage = conversation.lastMessage as LastMessageLite | null | undefined;
  const senderId = String(
    lastMessage?.senderId || lastMessage?.sender?._id || "",
  );
  const senderName = String(lastMessage?.sender?.displayName || "").trim();
  const normalizedContent = String(lastMessage?.content || "").trim();

  let fallbackContent = normalizedContent;
  if (!fallbackContent) {
    if (lastMessage?.audioUrl) {
      fallbackContent = "Voice message";
    } else if (lastMessage?.imgUrl) {
      fallbackContent = "Photo attachment";
    }
  }

  if (!fallbackContent) {
    return conversation.type === "group"
      ? `${conversation.participants.length} members`
      : "Start your conversation";
  }

  if (senderId && senderId === currentUserId) {
    return `You: ${fallbackContent}`;
  }

  if (conversation.type === "group" && senderName) {
    return `${senderName}: ${fallbackContent}`;
  }

  return fallbackContent;
};

const ChatWelcomeScreen = () => {
  const conversations = useChatStore((state) => state.conversations);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const fetchMessages = useChatStore((state) => state.fetchMessages);
  const user = useAuthStore((state) => state.user);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const { getFriends } = useFriendStore();
  const currentUserId = String(user?._id || "");

  const recentConversations = useMemo(
    () =>
      [...conversations]
        .sort(
          (left, right) =>
            toConversationTimestamp(right) - toConversationTimestamp(left),
        )
        .slice(0, 4),
    [conversations],
  );
  const latestConversation = recentConversations[0] ?? null;

  const unreadConversationCount = useMemo(() => {
    if (!currentUserId) {
      return 0;
    }

    return conversations.filter(
      (conversation) => Number(conversation.unreadCounts?.[currentUserId] || 0) > 0,
    ).length;
  }, [conversations, currentUserId]);

  const totalUnreadCount = useMemo(() => {
    if (!currentUserId) {
      return 0;
    }

    return conversations.reduce((sum, conversation) => {
      const unread = Number(conversation.unreadCounts?.[currentUserId] || 0);
      return sum + (Number.isFinite(unread) ? Math.max(0, unread) : 0);
    }, 0);
  }, [conversations, currentUserId]);

  const directConversationCount = useMemo(
    () => conversations.filter((conversation) => conversation.type === "direct").length,
    [conversations],
  );

  const groupConversationCount = useMemo(
    () => conversations.filter((conversation) => conversation.type === "group").length,
    [conversations],
  );

  const recentConversationRows = useMemo(
    () =>
      recentConversations.map((conversation) => {
        const unread = Number(conversation.unreadCounts?.[currentUserId] || 0);
        const timestamp = toConversationTimestamp(conversation);

        return {
          id: String(conversation._id || ""),
          type: conversation.type,
          name: resolveConversationDisplayName(conversation, currentUserId),
          preview: resolveConversationPreview(conversation, currentUserId),
          unread: Number.isFinite(unread) ? Math.max(0, unread) : 0,
          timeLabel: timestamp > 0 ? formatOnlineTime(new Date(timestamp)) : "now",
        };
      }),
    [currentUserId, recentConversations],
  );

  const handleOpenNewDirectChat = async () => {
    try {
      await getFriends();
      setShowNewDirect(true);
    } catch (error) {
      console.error("Failed to load friends before opening direct chat", error);
    }
  };

  const handleOpenConversation = async (conversationId: string) => {
    const normalizedConversationId = String(conversationId || "").trim();
    if (!normalizedConversationId) {
      return;
    }

    setActiveConversation(normalizedConversationId);
    await fetchMessages(normalizedConversationId);
  };

  const handleResumeLatestConversation = async () => {
    if (!latestConversation?._id) {
      return;
    }

    await handleOpenConversation(String(latestConversation._id));
  };

  return (
    <SidebarInset className="chat-shell-panel chat-main-shell">
      <ChatWindowHeader />

      <div className="chat-welcome-shell">
        <div className="chat-welcome-grid">
          <section className="chat-welcome-hero-card">
            <div className="chat-welcome-icon-wrap" aria-hidden="true">
              <div className="chat-welcome-icon-main">
                <MessageSquareDashed className="size-8 text-primary/85" strokeWidth={1.6} />
              </div>
              <div className="chat-welcome-icon-badge">
                <Zap className="size-4 text-primary" strokeWidth={2.1} />
              </div>
            </div>

            <p className="chat-welcome-kicker">Clean communication workspace</p>
            <h1 className="chat-welcome-title">Welcome back to Messages</h1>
            <p className="chat-welcome-copy">
              Everything is organized for speed: jump into recent threads or start a fresh direct/group chat in one step.
            </p>

            <div className="chat-welcome-action-stack">
              <button
                type="button"
                onClick={() => {
                  if (latestConversation?._id) {
                    void handleResumeLatestConversation();
                    return;
                  }

                  void handleOpenNewDirectChat();
                }}
                className="chat-welcome-primary-btn"
              >
                <Clock3 className="size-4" />
                {latestConversation ? "Resume latest chat" : "Start direct chat"}
              </button>

              <div className="chat-welcome-secondary-actions">
                <button
                  type="button"
                  onClick={() => {
                    void handleOpenNewDirectChat();
                  }}
                  className="chat-welcome-secondary-btn"
                >
                  <Plus className="size-4" />
                  New Direct
                </button>

                <button
                  type="button"
                  onClick={() => setShowNewGroup(true)}
                  className="chat-welcome-secondary-btn"
                >
                  <Users className="size-4" />
                  New Group
                </button>
              </div>
            </div>

            <div className="chat-welcome-stat-grid">
              <article className="chat-welcome-stat-card">
                <p className="chat-welcome-stat-label">Total chats</p>
                <p className="chat-welcome-stat-value">{conversations.length}</p>
              </article>

              <article className="chat-welcome-stat-card">
                <p className="chat-welcome-stat-label">Direct</p>
                <p className="chat-welcome-stat-value">{directConversationCount}</p>
              </article>

              <article className="chat-welcome-stat-card">
                <p className="chat-welcome-stat-label">Groups</p>
                <p className="chat-welcome-stat-value">{groupConversationCount}</p>
              </article>

              <article className="chat-welcome-stat-card">
                <p className="chat-welcome-stat-label">Unread</p>
                <p className="chat-welcome-stat-value">{formatUnreadBadge(totalUnreadCount)}</p>
                {unreadConversationCount > 0 && (
                  <p className="chat-welcome-stat-note">
                    across {formatUnreadBadge(unreadConversationCount)} conversations
                  </p>
                )}
              </article>
            </div>
          </section>

          <section className="chat-welcome-recent-card" aria-label="Recent conversations">
            <div className="chat-welcome-recent-head">
              <div>
                <p className="chat-welcome-kicker">Jump back in</p>
                <h2 className="chat-welcome-recent-title">Recent conversations</h2>
              </div>
              <span className="chat-welcome-recent-count">
                {formatUnreadBadge(recentConversationRows.length)}
              </span>
            </div>

            {recentConversationRows.length > 0 ? (
              <ul className="chat-welcome-recent-list">
                {recentConversationRows.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => {
                        void handleOpenConversation(conversation.id);
                      }}
                      className={cn(
                        "chat-welcome-recent-item",
                        conversation.unread > 0 && "chat-welcome-recent-item--unread",
                      )}
                    >
                      <div className="chat-welcome-recent-main">
                        <div className="chat-welcome-recent-row">
                          <p className="chat-welcome-recent-name">{conversation.name}</p>
                          <span className="chat-welcome-recent-time">{conversation.timeLabel}</span>
                        </div>

                        <p className="chat-welcome-recent-preview">{conversation.preview}</p>

                        <p className="chat-welcome-recent-type">
                          {conversation.type === "group" ? (
                            <Users className="size-3.5" />
                          ) : (
                            <MessageCircle className="size-3.5" />
                          )}
                          {conversation.type === "group" ? "Group chat" : "Direct chat"}
                        </p>
                      </div>

                      <div className="chat-welcome-recent-tail" aria-hidden="true">
                        {conversation.unread > 0 && (
                          <span className="chat-welcome-recent-unread">
                            {formatUnreadBadge(conversation.unread)}
                          </span>
                        )}
                        <ArrowRight className="size-4" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="chat-welcome-empty-state">
                <p className="chat-welcome-empty-title">No conversations yet</p>
                <p className="chat-welcome-empty-copy">
                  Create a direct or group chat to populate your recent list.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* New Direct Chat Modal */}
      <Dialog open={showNewDirect} onOpenChange={setShowNewDirect}>
        <FriendListModal />
      </Dialog>

      {/* New Group Modal */}
      <NewGroupChatModal
        isOpen={showNewGroup}
        onClose={() => setShowNewGroup(false)}
      />
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;

