import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import ChatCard from "./ChatCard";
import UnreadCountBadge from "./UnreadCountBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useLocation, useNavigate } from "react-router-dom";

const GroupChatCard = ({ convo }: { convo: Conversation }) => {
  const { user } = useAuthStore();
  const {
    activeConversationId,
    setActiveConversation,
    messages,
    fetchMessages,
  } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user) return null;

  const unreadCount = convo.unreadCounts[user._id];
  const normalizedLastMessage = String(
    convo.lastMessage?.content || "",
  ).toLowerCase();
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
        <>
          {unreadCount > 0 && <UnreadCountBadge unreadCount={unreadCount} />}
          <GroupChatAvatar participants={convo.participants} type="chat" />
        </>
      }
      subtitle={
        <p className="text-sm truncate text-muted-foreground">
          {convo.participants.length} members
        </p>
      }
    />
  );
};

export default GroupChatCard;
