import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import GroupChatAvatar from "./GroupChatAvatar";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useSocketStore } from "@/stores/useSocketStore";
import { Crown, Shield } from "lucide-react";
import { memo, useCallback } from "react";

const LEGACY_PHOTO_PREVIEW = "\ud83d\udcf7 Photo";

const GroupChatCardInner = ({ convo }: { convo: Conversation }) => {
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

  if (
    lastMessagePreview === "Photo attachment" ||
    lastMessagePreview === LEGACY_PHOTO_PREVIEW
  ) {
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
  const myUserId = String(user._id || "");
  const myChannelUnreadMap =
    convo.group?.channelUnreadCounts?.[myUserId] || {};
  const channelUnreadBadges = (convo.group?.channels || [])
    .map((channel) => {
      const channelId = String(channel.channelId || "");
      const unread = Number(myChannelUnreadMap?.[channelId] || 0);
      return {
        channelId,
        name: String(channel.name || channelId),
        unread,
      };
    })
    .filter((channel) => channel.unread > 0)
    .sort((a, b) => b.unread - a.unread)
    .slice(0, 3);
  const ownerId = String(convo.group?.createdBy || "");
  const adminIds = new Set((convo.group?.adminIds || []).map(String));
  let myRole: "owner" | "admin" | "member" = "member";
  if (ownerId === myUserId) {
    myRole = "owner";
  } else if (adminIds.has(myUserId)) {
    myRole = "admin";
  }

  // Online member count
  const onlineSet = new Set(onlineUsers);
  const onlineMemberCount = convo.participants.filter(p => onlineSet.has(String(p._id))).length;

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConversation(id);
    if (location.pathname !== "/") {
      navigate("/");
    }
    if (!messages[id]) {
      await fetchMessages(id);
    }
  }, [setActiveConversation, location.pathname, navigate, messages, fetchMessages]);

  return (
    <ChatCard
      convoId={convo._id}
      name={name}
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
        <div className="relative flex-shrink-0">
          <GroupChatAvatar participants={convo.participants} type="chat" />
        </div>
      }
      subtitle={
        <div className="chat-sidebar-card-subtitle-wrap mt-[1px]">
          <p
            className={cn(
              "chat-sidebar-card-preview text-[13px] truncate leading-snug",
              unreadCount > 0
                ? "font-semibold text-foreground"
                : "font-normal text-muted-foreground/80",
            )}
          >
            {lastMessagePreview || "\u00A0"}
          </p>
          <p className="chat-sidebar-card-meta-row text-[11px] text-muted-foreground/55 truncate leading-tight flex items-center gap-1">
            <span className="inline-block">{convo.participants.length}</span>
            <span>members</span>
            {onlineMemberCount > 0 && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="chat-presence-dot-sm size-1.5 rounded-full bg-online inline-block flex-shrink-0" />
                <span className="text-online font-medium">{onlineMemberCount} online</span>
              </>
            )}
            {myRole === "owner" && (
              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-warning/45 bg-warning/15 px-1 py-[1px] text-[10px] font-semibold text-warning">
                <Crown className="size-2.5" />
                Owner
              </span>
            )}
            {myRole === "admin" && (
              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/12 px-1 py-[1px] text-[10px] font-semibold text-primary">
                <Shield className="size-2.5" />
                Admin
              </span>
            )}
          </p>
          {channelUnreadBadges.length > 0 && (
            <div className="mt-1 flex items-center gap-1 overflow-x-auto beautiful-scrollbar pb-0.5">
              {channelUnreadBadges.map((channel) => (
                <span
                  key={channel.channelId}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                  title={`#${channel.name}: ${channel.unread} unread`}
                >
                  <span>#{channel.name}</span>
                  <span className="rounded-full bg-primary/20 px-1 py-[1px] leading-none">
                    {channel.unread > 99 ? "99+" : channel.unread}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
};

const GroupChatCard = memo(GroupChatCardInner);

export default GroupChatCard;
