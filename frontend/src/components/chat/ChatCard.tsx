import { Card } from "@/components/ui/card";
import { formatOnlineTime, cn } from "@/lib/utils";

interface ChatCardProps {
  convoId: string;
  name: string;
  timestamp?: Date;
  isActive: boolean;
  onSelect: (id: string) => void;
  unreadCount?: number;
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
  leftSection,
  subtitle,
}: ChatCardProps) => {
  const hasUnread = (unreadCount ?? 0) > 0;

  return (
    <Card
      key={convoId}
      data-chat-card="true"
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Open conversation with ${name}`}
      className={cn(
        "cursor-pointer rounded-xl border border-transparent px-3 py-2.5 transition-all duration-200",
        "hover:border-border/70 hover:bg-muted/60 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
        "group select-none",
        isActive
          ? "border-primary/30 bg-gradient-to-r from-primary/10 to-primary-foreground ring-1 ring-primary/20 shadow-sm"
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
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">{leftSection}</div>

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
            {hasUnread && (
              <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold shadow-sm animate-in zoom-in duration-200">
                {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ChatCard;
