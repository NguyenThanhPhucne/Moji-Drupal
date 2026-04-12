import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import GroupChatAvatar from "./GroupChatAvatar";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useSocketStore } from "@/stores/useSocketStore";

const GroupChatCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
  } = useChatStore();
  const { onlineUsers } = useSocketStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  // ── Null-safe unread count (Bug #1 fix) ────────────────────────────────
  const unreadCount = convo.unreadCounts?.[String(user._id)] ?? 0;

  // ── Context-aware last message preview (Bug #2 fix) ────────────────────
  let lastMessagePreview = convo.lastMessage?.content ?? "";

  if (lastMessagePreview === "📷 Photo") {
    const lastMsg = convo.lastMessage as {
      senderId?: string;
      sender?: { _id: string };
    } | undefined | null;
    const senderId = lastMsg?.senderId || lastMsg?.sender?._id;
    const senderParticipant = convo.participants.find(
      (p) => String(p._id) === String(senderId),
    );

    if (String(senderId) === String(user._id)) {
      lastMessagePreview = "You sent a photo";
    } else if (senderParticipant?.displayName) {
      lastMessagePreview = `${senderParticipant.displayName} sent a photo`;
    } else {
      lastMessagePreview = "Someone sent a photo";
    }
  }

  const normalizedLastMessage = lastMessagePreview.toLowerCase();
  const mentionPatterns = [
    `@${(user.username || "").toLowerCase()}`,
    `@${(user.displayName || "").toLowerCase()}`,
    "@all",
    "@everyone",
  ].filter(Boolean);
  const mentionCount =
    unreadCount > 0 &&
    mentionPatterns.some((pattern) => normalizedLastMessage.includes(pattern))
      ? 1
      : 0;

  const name = convo.group?.name ?? "";

  // Online member count
  const onlineSet = new Set(onlineUsers);
  const onlineMemberCount = convo.participants.filter(p => onlineSet.has(String(p._id))).length;

  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);
    if (location.pathname !== "/") {
      navigate("/");
    }
    if (!messages[id]) {
      await fetchMessages(id);
    }
  };

  return (
    <ChatCard
      convoId={convo._id}
      name={name}
      timestamp={
        convo.lastMessage?.createdAt
          ? new Date(convo.lastMessage.createdAt)
          : undefined
      }
      isActive={activeConversationId === convo._id}
      onSelect={handleSelectConversation}
      unreadCount={unreadCount}
      mentionCount={mentionCount}
      leftSection={
        <div className="relative flex-shrink-0">
          <GroupChatAvatar participants={convo.participants} type="chat" />
        </div>
      }
      subtitle={
        <div className="mt-[1px]">
          <p
            className={cn(
              "text-[13px] truncate leading-snug",
              unreadCount > 0
                ? "font-semibold text-foreground"
                : "font-normal text-muted-foreground/80",
            )}
          >
            {lastMessagePreview || "\u00A0"}
          </p>
          <p className="text-[11px] text-muted-foreground/55 truncate leading-tight flex items-center gap-1">
            <span className="inline-block">{convo.participants.length}</span>
            <span>members</span>
            {onlineMemberCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="size-1.5 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">{onlineMemberCount} online</span>
              </>
            )}
          </p>
        </div>
      }
    />
  );
};

export default GroupChatCard;
