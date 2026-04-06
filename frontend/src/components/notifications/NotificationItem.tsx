import { formatDistanceToNow } from "date-fns";
import {
  Heart,
  MessageCircle,
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
}

// ─── Component ────────────────────────────────────────────────────────────────
const NotificationItem = ({
  notification,
  onRead,
  onDismiss,
  onAcceptFriend,
  onDeclineFriend,
  loadingId,
}: NotificationItemProps) => {
  const [hovered, setHovered] = useState(false);
  const meta = KIND_META[notification.kind];
  const isLoading = loadingId === notification.id;

  const handleClick = () => {
    if (!notification.isRead) {
      onRead(notification.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 cursor-pointer select-none",
        notification.isRead
          ? "bg-transparent hover:bg-muted/50"
          : "bg-primary/[0.07] hover:bg-primary/[0.12]",
        isLoading && "opacity-60 pointer-events-none",
      )}
    >
      {/* ── Avatar with type icon overlay ── */}
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar className="h-10 w-10 ring-2 ring-background">
          <AvatarImage
            src={notification.actor.avatarUrl ?? undefined}
            alt={notification.actor.displayName}
          />
          <AvatarFallback className="text-sm font-semibold">
            {notification.actor.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Type icon badge */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background",
            meta.colorClass,
          )}
        >
          <meta.Icon className="h-2.5 w-2.5 text-white" />
        </span>
      </div>

      {/* ── Content ── */}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug line-clamp-2">
          <span className="font-semibold text-foreground">
            {notification.actor.displayName}
          </span>{" "}
          <span className="text-foreground/80">{notification.message}</span>
        </p>

        <p
          className={cn(
            "mt-0.5 text-xs",
            notification.isRead ? "text-muted-foreground" : "text-primary font-medium",
          )}
        >
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>

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
      <div className="flex flex-shrink-0 flex-col items-center gap-2 self-start pt-0.5">
        {/* Unread blue dot */}
        {!notification.isRead && (
          <span className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
        )}

        {/* ⋯ Dismiss button — shown on hover */}
        {hovered && onDismiss && (
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(notification.id);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

export default NotificationItem;
