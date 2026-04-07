// Card import removed - using plain div instead
import { formatOnlineTime, cn } from "@/lib/utils";

interface ChatCardProps {
  convoId: string;
  name: string;
  timestamp?: Date;
  isActive: boolean;
  onSelect: (id: string) => void;
  unreadCount?: number;
  mentionCount?: number;
  leftSection: React.ReactNode;
  subtitle: React.ReactNode;
}

const ChatCard = ({
  convoId,
  name,
  timestamp,
  isActive,
  onSelect,
  unreadCount,
  mentionCount,
  leftSection,
  subtitle,
}: ChatCardProps) => {
  const hasUnread = (unreadCount ?? 0) > 0;
  const hasMention = (mentionCount ?? 0) > 0;

  return (
    <div
      key={convoId}
      data-chat-card="true"
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Open conversation with ${name}`}
      className={cn(
        "cursor-pointer rounded-[14px] border border-transparent px-3 py-2.5 transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40",
        "group select-none relative overflow-hidden active:scale-[0.98]",
        isActive
          ? "bg-muted/80 shadow-sm text-foreground border-border/40"
          : "bg-transparent hover:bg-muted/50 hover:border-border/30",
      )}
      onClick={() => onSelect(convoId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(convoId);
        }
      }}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" />
      )}

      <div className="flex flex-row items-center gap-3">
        {/* Avatar */}
        <div className="chat-card-avatar-wrap relative flex-shrink-0">{leftSection}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <h3
              className={cn(
                "text-sm truncate",
                hasUnread
                  ? "font-bold text-foreground"
                  : "font-semibold text-foreground/90",
                isActive && "text-primary",
              )}
            >
              {name}
            </h3>
            <span
              className={cn(
                "text-[11px] flex-shrink-0 ml-2",
                hasUnread
                  ? "text-primary font-semibold"
                  : "text-muted-foreground",
              )}
            >
              {timestamp ? formatOnlineTime(timestamp) : ""}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                "flex-1 min-w-0 text-xs truncate",
                hasUnread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {subtitle}
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              {hasMention && (
                <span className="unread-badge-entry inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-extrabold text-white shadow-sm">
                  @{(mentionCount ?? 0) > 9 ? "9+" : mentionCount}
                </span>
              )}
              {hasUnread && (
                <span className="unread-badge-entry inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white shadow-sm">
                  {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatCard;
