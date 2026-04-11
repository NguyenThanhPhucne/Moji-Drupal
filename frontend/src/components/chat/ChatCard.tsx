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
        "cursor-pointer rounded-xl border border-transparent px-3 py-[9px] select-none relative overflow-hidden",
        "transition-all duration-200 active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
        "group",
        !isActive && "hover:bg-muted/55 hover:translate-x-[2px]",
        isActive
          ? "bg-primary/[0.08] border-primary/10 text-foreground translate-x-0"
          : "bg-transparent",
      )}
      onClick={() => onSelect(convoId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(convoId);
        }
      }}
    >
      {/* Active left pill indicator — always rendered, width transitions */}
      <span
        className={cn(
          "absolute left-0 top-2 bottom-2 rounded-r-full bg-primary transition-all duration-250 ease-out",
          isActive ? "w-[3.5px] opacity-100" : "w-0 opacity-0"
        )}
      />

      <div className="flex flex-row items-center gap-3">
        {/* Avatar */}
        <div className="chat-card-avatar-wrap relative flex-shrink-0">{leftSection}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <h3
              className={cn(
                "text-sm leading-tight truncate",
                hasUnread ? "font-bold text-foreground" : "font-medium text-foreground/85",
                isActive && "text-primary",
              )}
            >
              {name}
            </h3>
            <span
              className={cn(
                "text-[11px] flex-shrink-0 ml-2 tabular-nums",
                hasUnread
                  ? "text-primary font-semibold"
                  : "text-muted-foreground/60 font-normal",
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
                <span className="badge-pop inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-extrabold text-white shadow-sm">
                  @{(mentionCount ?? 0) > 9 ? "9+" : mentionCount}
                </span>
              )}
              {hasUnread && (
                <span className="badge-pop inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white shadow-sm">
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
