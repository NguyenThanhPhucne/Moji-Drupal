import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  AtSign,
  ThumbsUp,
  MessageCircle,
  MessageCircleMore,
  UserCheck,
  UserPlus,
  Users,
  Bell,
  MoreHorizontal,
  Check,
  Trash2,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Unified notification type ────────────────────────────────────────────────
export type NotificationKind =
  | "friend_request"
  | "friend_accepted"
  | "like"
  | "comment"
  | "mention"
  | "follow"
  | "system";

export interface UnifiedNotification {
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
  requestId?: string;
  introMessage?: string;
}

// ─── Kind metadata ────────────────────────────────────────────────────────────
const KIND_META: Record<
  NotificationKind,
  { Icon: React.FC<{ className?: string }>; bg: string; text: string }
> = {
  friend_request:  { Icon: UserPlus,       bg: "notification-kind-friend-request-bg", text: "notification-kind-friend-request-text" },
  friend_accepted: { Icon: UserCheck,      bg: "notification-kind-friend-accepted-bg", text: "notification-kind-friend-accepted-text" },
  like:            { Icon: ThumbsUp,       bg: "notification-kind-like-bg", text: "notification-kind-like-text" },
  comment:         { Icon: MessageCircle,  bg: "notification-kind-comment-bg", text: "notification-kind-comment-text" },
  mention:         { Icon: AtSign,         bg: "notification-kind-mention-bg", text: "notification-kind-mention-text" },
  follow:          { Icon: Users,          bg: "notification-kind-follow-bg", text: "notification-kind-follow-text" },
  system:          { Icon: Bell,           bg: "notification-kind-system-bg", text: "notification-kind-system-text" },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface NotificationItemProps {
  notification: UnifiedNotification;
  onRead: (id: string) => void;
  onDismiss?: (id: string) => void;
  onAcceptFriend?: (requestId: string) => void;
  onDeclineFriend?: (requestId: string) => void;
  loadingId?: string | null;
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
  const showFriendRequestActions =
    notification.kind === "friend_request" &&
    Boolean(notification.requestId) &&
    Boolean(onAcceptFriend) &&
    Boolean(onDeclineFriend);

  const handleClick = () => {
    if (notification.kind === "friend_accepted" && onOpenDirectChat) {
      onOpenDirectChat();
      return;
    }
    if (!notification.isRead) {
      onRead(notification.id);
    }
  };

  return (
    <article
      className={cn(
        // Base layout
        "group relative flex items-start gap-3 rounded-xl px-3 py-3 select-none",
        // Smooth transition on all states
        "transition-colors duration-150",
        // Unread: light blue tint + left accent stripe (Facebook-style)
        notification.isRead
          ? "bg-transparent hover:bg-muted/50 dark:hover:bg-muted/40"
          : "bg-primary/[0.07] hover:bg-primary/[0.12] dark:bg-primary/[0.05] dark:hover:bg-primary/[0.08]",
        // Loading
        isLoading && "opacity-50 pointer-events-none",
      )}
    >
      {/* ── Left unread stripe ── */}
      {!notification.isRead && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] rounded-r-full bg-primary" />
      )}

      {/* ── Avatar ── */}
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar className="h-11 w-11">
          <AvatarImage
            src={notification.actor.avatarUrl ?? undefined}
            alt={notification.actor.displayName}
            className="object-cover"
          />
          <AvatarFallback className="avatar-fallback-accent text-sm font-semibold">
            {notification.actor.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Kind icon badge */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white dark:ring-background",
            meta.bg,
          )}
        >
          <meta.Icon className="h-2.5 w-2.5 text-white" />
        </span>
      </div>

      {/* ── Content ── */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={handleClick}
          className="w-full rounded-lg bg-transparent p-0 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2"
        >
          <p className="line-clamp-3 pr-1 text-[13.5px] leading-snug text-foreground">
            <span className="font-semibold">{notification.actor.displayName}</span>
            {" "}
            <span className="text-foreground/80">{notification.message}</span>
          </p>

          {/* Intro Message from Request */}
          {notification.introMessage && (
            <div className="relative mt-2.5 rounded-r-lg border-l-2 border-primary bg-muted/30 p-3 text-[13px] text-foreground/80 shadow-sm transition-colors hover:bg-muted/40">
              <span className="align-middle italic">" {notification.introMessage} "</span>
            </div>
          )}

          {/* Timestamp */}
          <p
            className={cn(
              "mt-1 text-[12px] font-semibold",
              notification.isRead
                ? "text-muted-foreground"
                : meta.text,
            )}
          >
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
              locale: enUS,
            })}
          </p>

          {/* ── "Chat now" pill for friend_accepted ── */}
          {notification.kind === "friend_accepted" && onOpenDirectChat && (
            <div className="mt-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary transition-colors group-hover:bg-primary/15">
                <MessageCircleMore className="h-3.5 w-3.5" />
                Chat now
              </span>
            </div>
          )}
        </button>

        {/* ── Accept / Decline buttons for friend_request ── */}
        {showFriendRequestActions && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              className="h-[34px] rounded-[10px] px-4 text-[13px] font-semibold shadow-sm transition-colors"
              onClick={() => {
                onAcceptFriend!(notification.requestId!);
                onRead(notification.id);
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-1.5 h-[15px] w-[15px] animate-spin" />
              ) : (
                <Check className="mr-1.5 h-[15px] w-[15px]" />
              )}
              Confirm
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-[34px] rounded-[10px] px-4 text-[13px] font-semibold text-foreground/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onDeclineFriend!(notification.requestId!);
                onRead(notification.id);
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-[15px] w-[15px] animate-spin text-muted-foreground" />
              ) : (
                "Delete"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* ── Right: unread dot + options menu ── */}
      <div className="flex flex-shrink-0 flex-col items-center gap-2.5 self-start pt-1">
        {/* Blue dot */}
        {!notification.isRead && (
          <span className="h-3 w-3 rounded-full bg-primary flex-shrink-0" />
        )}

        {/* ⋯ More options */}
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Notification options"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/60",
                "transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
                dropdownOpen
                  ? "opacity-100 bg-muted text-foreground"
                  : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="w-52"
            onClick={(e) => e.stopPropagation()}
          >
            {!notification.isRead && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRead(notification.id);
                  setDropdownOpen(false);
                }}
                className="cursor-pointer gap-2 text-[13px]"
              >
                <Check className="h-4 w-4 text-muted-foreground" />
                Mark as read
              </DropdownMenuItem>
            )}
            {!notification.isRead && onDismiss && <DropdownMenuSeparator />}
            {onDismiss && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(notification.id);
                  setDropdownOpen(false);
                }}
                className="cursor-pointer gap-2 text-[13px] text-destructive focus:text-destructive focus:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                Remove this notification
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
};

export default NotificationItem;
