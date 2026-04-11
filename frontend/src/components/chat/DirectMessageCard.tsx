import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { cn, formatOnlineTime } from "@/lib/utils";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import { useSocketStore } from "@/stores/useSocketStore";
import { useLocation, useNavigate } from "react-router-dom";

const DirectMessageCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
  } = useChatStore();
  const { getUserPresence, getLastActiveAt } = useSocketStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const otherUser = convo.participants.find(
    (p) => String(p._id) !== String(user._id),
  );
  if (!otherUser) return null;

  const unreadCount = convo.unreadCounts?.[String(user._id)] ?? 0;
  let lastMessage = convo.lastMessage?.content ?? "";
  
  if (lastMessage === "📷 Photo") {
    const lastMsgContent = convo.lastMessage as { senderId?: string; sender?: { _id: string } } | undefined | null;
    const senderId =
      lastMsgContent?.senderId ||
      lastMsgContent?.sender?._id;

    if (senderId === user._id) {
      lastMessage = "You sent a photo";
    } else if (senderId === otherUser._id) {
      lastMessage = `${otherUser.displayName} sent a photo`;
    } else {
      lastMessage = "Sent a photo";
    }
  }

  const normalizedLastMessage = lastMessage.toLowerCase();
  const directMentionPatterns = [
    user.username ? `@${user.username.toLowerCase()}` : "",
    user.displayName ? `@${user.displayName.toLowerCase()}` : "",
  ].filter(Boolean);
  const mentionCount =
    unreadCount > 0 &&
    directMentionPatterns.some((pattern) => normalizedLastMessage.includes(pattern))
      ? 1
      : 0;

  const handleSelectConversation = async (id: string) => {
    setActiveConversation(id);

    if (location.pathname !== "/") {
      navigate("/");
    }

    if (!messages[id]) {
      await fetchMessages(id);
    }
  };

  const userPresence = getUserPresence(otherUser?._id);
  const lastActiveAt = getLastActiveAt(otherUser?._id);

  let activeStatusText = "Offline";
  if (userPresence === "online") {
    activeStatusText = "Active now";
  } else if (userPresence === "recently-active" && lastActiveAt) {
    const timeStr = formatOnlineTime(new Date(lastActiveAt));
    activeStatusText = `Active ${timeStr} ago`;
  }

  return (
    <ChatCard
      convoId={convo._id}
      name={otherUser.displayName ?? ""}
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
        <>
          <UserAvatar
            type="sidebar"
            name={otherUser.displayName ?? ""}
            avatarUrl={otherUser.avatarUrl ?? undefined}
          />
          <StatusBadge
            status={getUserPresence(otherUser?._id)}
            userId={otherUser?._id}
          />
        </>
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
            {lastMessage || "\u00A0"}
          </p>
          {userPresence !== "offline" && (
            <p className={cn(
              "text-[11px] truncate leading-tight flex items-center gap-1",
              userPresence === "online"
                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                : "text-muted-foreground/60",
            )}>
              {userPresence === "online" && (
                <span className="size-1.5 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
              )}
              {activeStatusText}
            </p>
          )}
        </div>
      }
    />
  );
};

export default DirectMessageCard;

