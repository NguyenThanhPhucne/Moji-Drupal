import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
  MessageCircleMore,
  UserCheck,
  UserPlus,
  Users,
  Bell,
  MoreHorizontal,
  Check,
  X,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Unified notification type consumed by NotificationHub ────────────────────
export type NotificationKind =
  | "friend_request"
  | "friend_accepted"
  | "like"
  | "comment"
  | "follow"
  | "system";

export interface UnifiedNotification {
  /** Unique key for react rendering */
  id: string;
  kind: NotificationKind;
  actor: {
    _id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  message: string;
  isRead: boolean;
  createdAt: string;
  /** Only for friend_request kind */
  requestId?: string;
}

// ─── Type → icon + color ──────────────────────────────────────────────────────
const KIND_META: Record<
  NotificationKind,
  { Icon: React.FC<{ className?: string }>; colorClass: string }
> = {
  friend_request: { Icon: UserPlus, colorClass: "bg-blue-500" },
  friend_accepted: { Icon: UserCheck, colorClass: "bg-emerald-500" },
  like: { Icon: Heart, colorClass: "bg-rose-500" },
  comment: { Icon: MessageCircle, colorClass: "bg-indigo-500" },
  follow: { Icon: Users, colorClass: "bg-cyan-500" },
  system: { Icon: Bell, colorClass: "bg-slate-500" },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface NotificationItemProps {
  notification: UnifiedNotification;
  onRead: (id: string) => void;
  onDismiss?: (id: string) => void;
  onAcceptFriend?: (requestId: string) => void;
  onDeclineFriend?: (requestId: string) => void;
  loadingId?: string | null;
  /** For friend_accepted: instantly open a direct conversation */
  onOpenDirectChat?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
const NotificationItem = ({
  notification,
  onRead,
  onDismiss,
  onAcceptFriend,
  onDeclineFriend,
  loadingId,
  onOpenDirectChat,
}: NotificationItemProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const meta = KIND_META[notification.kind];
  const isLoading = loadingId === notification.id;

  const handleClick = () => {
    // friend_accepted: open chat immediately
    if (notification.kind === "friend_accepted" && onOpenDirectChat) {
      onOpenDirectChat();
      return;
    }
    if (!notification.isRead) {
      onRead(notification.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group relative flex items-start gap-4 rounded-xl p-3 transition-all duration-200 cursor-pointer select-none active:scale-[0.99]",
        notification.isRead
          ? "bg-transparent hover:bg-accent/40"
          : "bg-primary/[0.04] hover:bg-primary/[0.08] shadow-[inset_3px_0_0_0_hsl(var(--primary))]",
        isLoading && "opacity-60 pointer-events-none grayscale-[0.2]",
      )}
    >
      {/* ── Avatar with type icon overlay ── */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-11 w-11 shadow-xs border border-background/50">
          <AvatarImage
            src={notification.actor.avatarUrl ?? undefined}
            alt={notification.actor.displayName}
            className="object-cover"
          />
          <AvatarFallback className="text-sm font-semibold bg-accent/50">
            {notification.actor.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Type icon badge */}
        <span
          className={cn(
            "absolute -bottom-1 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full ring-[2.5px] ring-background shadow-xs",
            meta.colorClass,
          )}
        >
          <meta.Icon className="h-3 w-3 text-white" />
        </span>
      </div>

      {/* ── Content ── */}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug line-clamp-2 pr-2">
          <span className="font-semibold text-foreground tracking-tight">
            {notification.actor.displayName}
          </span>{" "}
          <span className="text-foreground/85">{notification.message}</span>
        </p>

        <p
          className={cn(
            "mt-1 text-[11px] font-medium tracking-wide flex items-center gap-1",
            notification.isRead ? "text-muted-foreground" : "text-primary/90",
          )}
        >
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>

        {/* ── "Chat now" CTA for friend_accepted ── */}
        {notification.kind === "friend_accepted" && onOpenDirectChat && (
          <div className="mt-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary ring-1 ring-primary/20 group-hover:bg-primary/15 transition-colors">
              <MessageCircleMore className="h-3 w-3" />
              Nhấn để nhắn tin ngay
            </span>
          </div>
        )}

        {/* ── Inline quick actions (friend request only) ── */}
        {notification.kind === "friend_request" &&
          notification.requestId &&
          onAcceptFriend &&
          onDeclineFriend && (
            <div
              className="mt-2 flex gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => {
                  onAcceptFriend(notification.requestId!);
                  onRead(notification.id);
                }}
                disabled={isLoading}
              >
                <Check className="mr-1 h-3 w-3" />
                Xác nhận
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs text-destructive hover:text-destructive"
                onClick={() => {
                  onDeclineFriend(notification.requestId!);
                  onRead(notification.id);
                }}
                disabled={isLoading}
              >
                <X className="mr-1 h-3 w-3" />
                Xóa
              </Button>
            </div>
          )}
      </div>

      {/* ── Right: unread dot + hover dismiss button ── */}
      <div className="flex flex-shrink-0 flex-col items-center gap-3 self-start pt-1">
        {/* Unread blue dot with soft glow */}
        {!notification.isRead && (
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)_/_0.6)]" />
        )}

        {/* ⋯ More button — always mounted but hidden unless hovered or focused/open */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Tùy chọn thông báo"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground",
                dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {!notification.isRead && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRead(notification.id);
                  setDropdownOpen(false);
                }}
                className="cursor-pointer"
              >
                <Check className="mr-2 h-4 w-4" />
                Đánh dấu đã đọc
              </DropdownMenuItem>
            )}
            {onDismiss && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(notification.id);
                  setDropdownOpen(false);
                }}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
              >
                <X className="mr-2 h-4 w-4" />
                Gỡ thông báo này
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default NotificationItem;
