import { useChatStore } from "@/stores/useChatStore";
import DirectMessageCard from "./DirectMessageCard";
import { getStaggerEnterClass } from "@/lib/utils";
import { MessagesSquare } from "lucide-react";

const DirectMessageList = () => {
  const { conversations } = useChatStore();

  if (!conversations || conversations.length === 0) return null;

  const directConversations = conversations.filter(
    (convo) => convo.type === "direct",
  );

  if (directConversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center mt-4">
        <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 ring-4 ring-background shadow-sm">
          <MessagesSquare className="size-5 text-muted-foreground/80" />
        </div>
        <p className="text-[13px] font-semibold text-foreground/80">No messages</p>
        <p className="text-[11.5px] text-muted-foreground/70 mt-1 max-w-[170px]">
          Start chatting with friends
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-2 space-y-0.5">
      <div className="mb-1.5 flex items-center justify-between px-3 pt-3 pb-1">
        <p className="text-[11px] font-semibold text-muted-foreground/70 tracking-[0.04em] uppercase">
          Messages
        </p>
      </div>

      {directConversations.map((convo, index) => (
        <div
          key={convo._id}
          className={getStaggerEnterClass(index)}
        >
          <DirectMessageCard convo={convo} />
        </div>
      ))}
    </div>
  );
};

export default DirectMessageList;
