import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import SocialNotificationsSkeleton from "@/components/skeleton/SocialNotificationsSkeleton";
import type { SocialNotification } from "@/types/social";

interface SocialNotificationsPanelProps {
  notifications: SocialNotification[];
  loading?: boolean;
  compact?: boolean;
  onReadOne: (notificationId: string) => Promise<void>;
  onReadAll: () => Promise<void>;
}

const SocialNotificationsPanel = ({
  notifications,
  loading = false,
  compact = false,
  onReadOne,
  onReadAll,
}: SocialNotificationsPanelProps) => {
  const unread = notifications.filter((item) => !item.isRead).length;
  const visibleNotifications = compact
    ? notifications.slice(0, 4)
    : notifications.slice(0, 8);

  return (
    <aside className={`elevated-card ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          className={`${compact ? "text-lg" : "text-title-2"} flex items-center gap-2`}
        >
          <Bell className="size-5" />
          Notifications
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReadAll}
          disabled={unread === 0}
        >
          <CheckCheck className="size-4" />
          <span className={compact ? "sr-only" : "inline"}>Mark all read</span>
        </Button>
      </div>

      <div
        className={`space-y-2 overflow-y-auto pr-1 ${
          compact
            ? "max-h-[36svh]"
            : "max-h-[45svh] xl:max-h-[calc(100svh-10rem)]"
        }`}
      >
        {loading && notifications.length === 0 && (
          <SocialNotificationsSkeleton
            count={compact ? 3 : 4}
            compact={compact}
          />
        )}

        {visibleNotifications.map((notification, index) => (
          <button
            key={notification._id}
            type="button"
            className={`stagger-enter w-full rounded-xl border text-left transition-colors ${
              compact ? "px-2.5 py-2" : "px-3 py-2"
            } ${
              notification.isRead
                ? "border-border/60 bg-background/55"
                : "border-primary/30 bg-primary/10"
            }`}
            style={{ "--stagger-index": index } as CSSProperties}
            onClick={() => onReadOne(notification._id)}
          >
            <p
              className={`${compact ? "text-[13px]" : "text-sm"} font-semibold`}
            >
              {notification.actorId.displayName}
            </p>
            <p
              className={`${compact ? "text-[13px]" : "text-sm"} text-muted-foreground`}
            >
              {notification.message}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
              })}
            </p>
          </button>
        ))}

        {!loading && notifications.length === 0 && (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        )}
      </div>
    </aside>
  );
};

export default SocialNotificationsPanel;
