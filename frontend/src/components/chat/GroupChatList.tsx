import { useChatStore } from "@/stores/useChatStore";
import GroupChatCard from "./GroupChatCard";
import type { CSSProperties } from "react";

const GroupChatList = () => {
  const { conversations } = useChatStore();

  if (!conversations || conversations.length === 0) return null;

  const groupchats = conversations.filter((convo) => convo.type === "group");

  if (groupchats.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No group chats
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {groupchats.map((convo, index) => (
        <div
          key={convo._id}
          className="stagger-enter"
          style={{ "--stagger-index": index % 10 } as CSSProperties}
        >
          <GroupChatCard convo={convo} />
        </div>
      ))}
    </div>
  );
};

export default GroupChatList;
