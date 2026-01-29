import { useNotificationStore } from "@/stores/useNotificationStore";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { X } from "lucide-react";

export function AcceptanceNotifications() {
  const { acceptanceNotifications, removeAcceptanceNotification } =
    useNotificationStore();

  console.log(
    "🔔 [AcceptanceNotifications] Rendering, count:",
    acceptanceNotifications.length,
  );
  console.log("📋 [AcceptanceNotifications] Data:", acceptanceNotifications);

  if (acceptanceNotifications.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Bạn chưa có thông báo nào.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {acceptanceNotifications.map((notification, index) => (
        <div
          key={index}
          className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent transition-colors"
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
                {new Date(notification.createdAt).toLocaleString("vi-VN")}
              </p>
            </div>
          </div>
          <button
            onClick={() => removeAcceptanceNotification(index)}
            className="p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
            aria-label="Xóa thông báo"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ))}
    </div>
  );
}
