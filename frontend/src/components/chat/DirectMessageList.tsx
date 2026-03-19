import { useChatStore } from "@/stores/useChatStore";
import DirectMessageCard from "./DirectMessageCard";
import type { CSSProperties } from "react";

const DirectMessageList = () => {
  const { conversations } = useChatStore();

  if (!conversations || conversations.length === 0) return null;

  const directConversations = conversations.filter(
    (convo) => convo.type === "direct",
  );

  if (directConversations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        No direct conversations yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {directConversations.map((convo, index) => (
        <div
          key={convo._id}
          className="stagger-enter"
          style={{ "--stagger-index": index % 10 } as CSSProperties}
        >
          <DirectMessageCard convo={convo} />
        </div>
      ))}
    </div>
  );
};

export default DirectMessageList;
