import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Inbox, Heart, MessageCircle, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SocialNotification } from "@/types/social";

// ─── Type icon mapping ────────────────────────────────────────────────────────
const TYPE_META: Record<
  SocialNotification["type"],
  { Icon: React.FC<{ className?: string }>; colorClass: string }
> = {
  like: { Icon: Heart, colorClass: "bg-rose-500" },
  comment: { Icon: MessageCircle, colorClass: "bg-indigo-500" },
  follow: { Icon: Users, colorClass: "bg-cyan-500" },
  system: { Icon: Bell, colorClass: "bg-slate-500" },
};

// ─── Skeleton premium ─────────────────────────────────────────────────────────
const SKEL_KEYS = ["sk1", "sk2", "sk3", "sk4"];

const NotificationSkeleton = ({
  compact,
  count = 4,
}: {
  compact?: boolean;
  count?: number;
}) => (
  <>
    {SKEL_KEYS.slice(0, count).map((key, i) => (
      <div
        key={key}
        className="flex items-start gap-3 rounded-xl px-3 py-2.5"
        style={{ "--stagger-index": i } as CSSProperties}
      >
        <Skeleton className="h-10 w-10 flex-shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className={cn("h-3.5", compact ? "w-1/2" : "w-3/4")} />
          <Skeleton className="h-3 w-full" />
          {!compact && <Skeleton className="h-3 w-4/5" />}
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    ))}
  </>
);

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Inbox className="h-6 w-6 text-muted-foreground" />
    </div>
    <p className="text-xs text-muted-foreground">Chưa có thông báo nào</p>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface SocialNotificationsPanelProps {
  notifications: SocialNotification[];
  loading?: boolean;
  compact?: boolean;
  onReadOne: (notificationId: string) => Promise<void>;
  onReadAll: () => Promise<void>;
}

// ─── Main component ───────────────────────────────────────────────────────────
const SocialNotificationsPanel = ({
  notifications,
  loading = false,
  compact = false,
  onReadOne,
  onReadAll,
}: SocialNotificationsPanelProps) => {
  const unread = notifications.filter((n) => !n.isRead).length;
  const visibleNotifications = compact
    ? notifications.slice(0, 5)
    : notifications.slice(0, 12);

  return (
    <aside
      className={cn(
        "elevated-card flex flex-col gap-0 overflow-hidden",
        compact ? "p-0" : "p-0",
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-center justify-between border-b border-border/60",
          compact ? "px-3 py-2.5" : "px-4 py-3",
        )}
      >
        <div className="flex items-center gap-2">
          <Bell className={cn(compact ? "h-4 w-4" : "h-5 w-5", "text-foreground")} />
          <h3
            className={cn(
              "font-semibold text-foreground",
              compact ? "text-sm" : "text-base",
            )}
          >
            Thông báo
          </h3>
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReadAll}
          disabled={unread === 0}
          className={cn(
            "gap-1.5 text-muted-foreground hover:text-foreground",
            compact ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-xs",
          )}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {!compact && <span>Đánh dấu đã đọc</span>}
          {compact && <span className="sr-only">Đánh dấu đã đọc</span>}
        </Button>
      </div>

      {/* ── Notification list ── */}
      <div
        className={cn(
          "overflow-y-auto beautiful-scrollbar",
          compact
            ? "max-h-[36svh] p-1.5"
            : "max-h-[calc(100svh-10rem)] p-2",
        )}
      >
        {loading && notifications.length === 0 && (
          <NotificationSkeleton compact={compact} count={compact ? 3 : 4} />
        )}

        {!loading && notifications.length === 0 && <EmptyState />}

        {visibleNotifications.map((notification, index) => {
          const meta = TYPE_META[notification.type] ?? TYPE_META.system;
          const { Icon, colorClass } = meta;

          return (
            <button
              key={notification._id}
              type="button"
              className={cn(
                "stagger-enter group w-full rounded-xl text-left transition-all duration-150",
                compact ? "px-2.5 py-2" : "px-3 py-2.5",
                notification.isRead
                  ? "hover:bg-muted/50"
                  : "bg-primary/[0.07] hover:bg-primary/[0.12]",
              )}
              style={{ "--stagger-index": index } as CSSProperties}
              onClick={() => onReadOne(notification._id)}
            >
              <div className="flex items-start gap-3">
                {/* ── Avatar + type badge ── */}
                <div className="relative flex-shrink-0 mt-0.5">
                  <Avatar className={cn("ring-2 ring-background", compact ? "h-9 w-9" : "h-10 w-10")}>
                    <AvatarImage
                      src={notification.actorId.avatarUrl ?? undefined}
                      alt={notification.actorId.displayName}
                    />
                    <AvatarFallback className="text-xs font-semibold">
                      {notification.actorId.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Type icon badge */}
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-background",
                      compact ? "h-3.5 w-3.5" : "h-4 w-4",
                      colorClass,
                    )}
                  >
                    <Icon className={cn(compact ? "h-2 w-2" : "h-2.5 w-2.5", "text-white")} />
                  </span>
                </div>

                {/* ── Content ── */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "line-clamp-2 leading-snug",
                      compact ? "text-[12px]" : "text-sm",
                    )}
                  >
                    <span className="font-semibold text-foreground">
                      {notification.actorId.displayName}
                    </span>{" "}
                    <span className="text-foreground/80">{notification.message}</span>
                  </p>

                  <p
                    className={cn(
                      "mt-0.5",
                      compact ? "text-[11px]" : "text-xs",
                      notification.isRead
                        ? "text-muted-foreground"
                        : "font-medium text-primary",
                    )}
                  >
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>

                {/* ── Unread dot ── */}
                {!notification.isRead && (
                  <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary ring-2 ring-background" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

export default SocialNotificationsPanel;
