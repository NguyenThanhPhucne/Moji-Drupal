import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SocialNotification } from "@/types/social";

interface SocialNotificationsPanelProps {
  notifications: SocialNotification[];
  onReadOne: (notificationId: string) => Promise<void>;
  onReadAll: () => Promise<void>;
}

const SocialNotificationsPanel = ({
  notifications,
  onReadOne,
  onReadAll,
}: SocialNotificationsPanelProps) => {
  const unread = notifications.filter((item) => !item.isRead).length;

  return (
    <aside className="elevated-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-title-2 flex items-center gap-2">
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
          Mark all read
        </Button>
      </div>

      <div className="space-y-2">
        {notifications.slice(0, 8).map((notification) => (
          <button
            key={notification._id}
            type="button"
            className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
              notification.isRead
                ? "border-border/60 bg-background/55"
                : "border-primary/30 bg-primary/10"
            }`}
            onClick={() => onReadOne(notification._id)}
          >
            <p className="text-sm font-semibold">
              {notification.actorId.displayName}
            </p>
            <p className="text-sm text-muted-foreground">
              {notification.message}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
              })}
            </p>
          </button>
        ))}

        {notifications.length === 0 && (
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        )}
      </div>
    </aside>
  );
};

export default SocialNotificationsPanel;
