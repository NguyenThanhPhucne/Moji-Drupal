import { useNotificationStore } from "@/stores/useNotificationStore";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { X } from "lucide-react";

export function AcceptanceNotifications() {
  const { acceptanceNotifications, removeAcceptanceNotification } =
    useNotificationStore();

  if (acceptanceNotifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        You have no notifications yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {acceptanceNotifications.map((notification, index) => (
        <div
          key={`${notification.from._id}-${String(notification.createdAt)}`}
          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/80 transition-colors focus-within:ring-2 focus-within:ring-primary/30"
        >
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 mt-0.5 flex-shrink-0">
              <AvatarImage
                src={notification.from.avatarUrl || undefined}
                alt={notification.from.displayName}
              />
              <AvatarFallback>
                {notification.from.displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {notification.from.displayName}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {notification.message}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(notification.createdAt).toLocaleString("en-US")}
              </p>
            </div>
          </div>
          <button
            onClick={() => removeAcceptanceNotification(index)}
            className="p-1 hover:bg-muted/70 rounded transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            aria-label="Delete notification"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
