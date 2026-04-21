// Card import removed - using plain div instead
import { formatOnlineTime, cn } from "@/lib/utils";
import { memo } from "react";

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

const ChatCardInner = ({
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
    <button
      type="button"
      key={convoId}
      data-chat-card="true"
      data-active={isActive ? "true" : "false"}
      aria-pressed={isActive}
      aria-label={`Open conversation with ${name}`}
      className={cn(
        "clean-card-hover chat-sidebar-card cursor-pointer rounded-[14px] px-3.5 py-2.5 select-none w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
      )}
      onClick={() => onSelect(convoId)}
    >

      <div className="flex flex-row items-center gap-3">
        {/* Avatar */}
        <div className="chat-card-avatar-wrap relative flex-shrink-0">{leftSection}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-[3px]">
            <h3
              className={cn(
                "chat-sidebar-card-title leading-tight truncate tracking-[-0.005em]",
                hasUnread ? "font-semibold text-foreground" : "font-medium text-foreground/85",
                isActive && "text-primary",
              )}
            >
              {name}
            </h3>
            <span
              className={cn(
                "chat-sidebar-card-time flex-shrink-0 ml-2 tabular-nums",
                hasUnread
                  ? "text-primary font-semibold"
                  : "text-muted-foreground/55 font-normal",
              )}
            >
              {timestamp ? formatOnlineTime(timestamp) : ""}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                "chat-sidebar-card-subtitle flex-1 min-w-0",
                hasUnread
                  ? "font-medium text-foreground text-[12.5px]"
                  : "text-muted-foreground text-xs",
              )}
            >
              {subtitle}
            </div>

            <div className="flex flex-shrink-0 items-center gap-1">
              {hasMention && (
                <span className="chat-sidebar-card-badge chat-sidebar-card-badge--mention chat-sidebar-card-badge--command inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-extrabold text-white shadow-sm">
                  @{(mentionCount ?? 0) > 9 ? "9+" : mentionCount}
                </span>
              )}
              {hasUnread && (
                <span className="chat-sidebar-card-badge chat-sidebar-card-badge--command inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-white shadow-sm">
                  {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

const ChatCard = memo(ChatCardInner);

export default ChatCard;
