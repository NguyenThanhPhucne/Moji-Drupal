import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { cn, formatOnlineTime } from "@/lib/utils";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import { useSocketStore } from "@/stores/useSocketStore";
import { useLocation, useNavigate } from "react-router-dom";
import { CornerUpRight } from "lucide-react";
import { memo, useCallback } from "react";

const LEGACY_PHOTO_PREVIEW = "\ud83d\udcf7 Photo";

type DirectUserLite = {
  _id: string;
  username?: string | null;
  displayName?: string | null;
};

const resolvePhotoPreviewText = (
  convo: Conversation,
  currentUser: DirectUserLite,
  otherUser: { _id: string; displayName?: string },
) => {
  const lastMsgContent = convo.lastMessage as
    | { senderId?: string; sender?: { _id: string } }
    | undefined
    | null;
  const senderId = lastMsgContent?.senderId || lastMsgContent?.sender?._id;

  if (senderId === currentUser._id) {
    return "You sent a photo";
  }

  if (senderId === otherUser._id) {
    return `${otherUser.displayName} sent a photo`;
  }

  return "Sent a photo";
};

const resolveLastMessagePreview = (
  convo: Conversation,
  currentUser: DirectUserLite,
  otherUser: { _id: string; displayName?: string },
) => {
  const lastMsg = convo.lastMessage as { content?: string; imgUrl?: string; audioUrl?: string; senderId?: string; sender?: { _id: string } } | null | undefined;
  const lastMessage = lastMsg?.content ?? "";

  // Audio message takes priority
  if (lastMsg?.audioUrl && !lastMessage.trim()) {
    const senderId = lastMsg?.senderId || (lastMsg as { sender?: { _id: string } })?.sender?._id;
    if (senderId === currentUser._id) return "You sent a voice message";
    if (senderId === otherUser._id) return `${otherUser.displayName} sent a voice message`;
    return "🎤 Voice message";
  }

  // Photo: check both imgUrl directly AND legacy content strings
  const isPhoto =
    Boolean(lastMsg?.imgUrl) ||
    lastMessage === "Photo attachment" ||
    lastMessage === LEGACY_PHOTO_PREVIEW;

  if (isPhoto) {
    return resolvePhotoPreviewText(convo, currentUser, otherUser);
  }

  return lastMessage;
};


const resolveMentionCount = (
  lastMessage: string,
  unreadCount: number,
  currentUser: DirectUserLite,
) => {
  if (unreadCount <= 0) {
    return 0;
  }

  const normalizedLastMessage = lastMessage.toLowerCase();
  const directMentionPatterns = [
    currentUser.username ? `@${currentUser.username.toLowerCase()}` : "",
    currentUser.displayName ? `@${currentUser.displayName.toLowerCase()}` : "",
  ].filter(Boolean);

  return directMentionPatterns.some((pattern) => normalizedLastMessage.includes(pattern))
    ? 1
    : 0;
};

const resolveActiveStatusText = (
  userPresence: string,
  lastActiveAt?: string | number | null,
) => {
  if (userPresence === "online") {
    return "Active now";
  }

  if (userPresence === "recently-active" && lastActiveAt) {
    const timeStr = formatOnlineTime(new Date(lastActiveAt));
    return `Active ${timeStr} ago`;
  }

  return "Offline";
};

const DirectMessageCardInner = ({ convo }: { convo: Conversation }) => {
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

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id);

    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.set("conversationId", String(id));
    nextSearchParams.delete("messageId");

    navigate({
      pathname: "/",
      search: `?${nextSearchParams.toString()}`,
    });

    if (!messages[id]) {
      void fetchMessages(id).catch((error) => {
        console.error("Failed to fetch direct conversation messages", error);
      });
    }
  }, [setActiveConversation, location.search, navigate, messages, fetchMessages]);

  if (!user) return null;

  const otherUser = convo.participants.find(
    (p) => String(p._id) !== String(user._id),
  );
  if (!otherUser) return null;

  const unreadCount = convo.unreadCounts?.[String(user._id)] ?? 0;
  const normalizedCurrentUser: DirectUserLite = {
    _id: String(user._id),
    username: user.username,
    displayName: user.displayName,
  };
  const normalizedOtherUser = {
    _id: String(otherUser._id),
    displayName: otherUser.displayName ?? "",
  };

  const lastMessage = resolveLastMessagePreview(
    convo,
    normalizedCurrentUser,
    normalizedOtherUser,
  );

  // Show forwarded indicator in preview
  const lastMsgExtra = convo.lastMessage as { isForwarded?: boolean } | null | undefined;
  const isForwardedPreview = lastMsgExtra?.isForwarded;

  const mentionCount = resolveMentionCount(
    lastMessage,
    unreadCount,
    normalizedCurrentUser,
  );

  const userPresence = getUserPresence(otherUser?._id);
  const lastActiveAt = getLastActiveAt(otherUser?._id);
  const activeStatusText = resolveActiveStatusText(userPresence, lastActiveAt);

  return (
    <ChatCard
      convoId={convo._id}
      name={otherUser.displayName ?? ""}
      timestamp={
        convo.lastMessage?.createdAt
          ? new Date(convo.lastMessage.createdAt)
          : undefined
      }
      isActive={String(activeConversationId || "") === String(convo._id)}
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
        <div className="chat-sidebar-card-subtitle-wrap mt-[1px]">
          <p
            className={cn(
              "chat-sidebar-card-preview text-[13px] truncate leading-snug flex items-center gap-1",
              unreadCount > 0
                ? "font-semibold text-foreground"
                : "font-normal text-muted-foreground/80",
            )}
          >
            {isForwardedPreview && (
              <span
                className="inline-flex items-center text-[10px] text-muted-foreground/50 font-medium shrink-0"
                aria-label="Forwarded message"
                title="Forwarded message"
              >
                <CornerUpRight className="size-3" aria-hidden="true" />
              </span>
            )}
            <span className="truncate">{lastMessage || "\u00A0"}</span>
          </p>
          {userPresence !== "offline" && (
            <p
              className={cn(
                "chat-sidebar-card-presence text-[11px] truncate leading-tight flex items-center gap-1",
                userPresence === "online"
                  ? "text-online font-medium"
                  : "text-muted-foreground/60",
              )}
            >
              {userPresence === "online" && (
                <span className="chat-presence-dot-sm size-1.5 rounded-full bg-online inline-block flex-shrink-0" />
              )}
              {activeStatusText}
            </p>
          )}
        </div>
      }
    />
  );
};

const DirectMessageCard = memo(DirectMessageCardInner);

export default DirectMessageCard;

