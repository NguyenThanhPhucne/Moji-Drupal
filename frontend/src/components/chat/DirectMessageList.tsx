import { useChatStore } from "@/stores/useChatStore";
import DirectMessageCard from "./DirectMessageCard";
import { getStaggerEnterClass } from "@/lib/utils";
import { MessagesSquare, Search, X } from "lucide-react";
import ConversationSkeleton from "@/components/skeleton/ConversationSkeleton";
import { useState } from "react";

const DirectMessageList = () => {
  const conversations = useChatStore((state) => state.conversations);
  const convoLoading = useChatStore((state) => state.convoLoading);
  const [filter, setFilter] = useState("");

  // Show skeleton on first load (no data yet)
  if (convoLoading && conversations.length === 0) {
    return <ConversationSkeleton />;
  }

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

  const query = filter.trim().toLowerCase();
  const filtered = query
    ? directConversations.filter((convo) => {
        const peer = convo.participants?.find(
          (p) => p.username || p.displayName,
        );
        const name = (peer?.displayName || peer?.username || "").toLowerCase();
        return name.includes(query);
      })
    : directConversations;

  return (
    <div className="chat-sidebar-section-list flex-1 overflow-y-auto pb-2 space-y-0.5">
      <div className="chat-sidebar-section-head mb-1.5 flex items-center justify-between px-3 pt-3 pb-1">
        <p className="chat-sidebar-section-title text-[11px] font-semibold text-muted-foreground/70 tracking-[0.04em] uppercase">
          Direct messages
        </p>
        <span className="chat-sidebar-section-count inline-flex items-center rounded-full border border-border/65 bg-muted/35 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/70">
          {directConversations.length}
        </span>
      </div>

      {/* Inline search filter */}
      {directConversations.length > 4 && (
        <div className="px-3 pb-1.5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 size-3 text-muted-foreground/50" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="h-7 w-full rounded-lg border border-border/50 bg-muted/35 pl-7 pr-7 text-[11.5px] text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="absolute right-2 text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label="Clear filter"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {filtered.length === 0 && query && (
        <div className="px-3 py-4 text-center text-[12px] text-muted-foreground/60">
          No results for &ldquo;{filter}&rdquo;
        </div>
      )}

      {filtered.map((convo, index) => (
        <div
          key={convo._id}
          className={`chat-sidebar-card-enter ${getStaggerEnterClass(index)}`}
        >
          <DirectMessageCard convo={convo} />
        </div>
      ))}
    </div>
  );
};

export default DirectMessageList;
