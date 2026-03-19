import { Bell } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  className?: string;
  showBell?: boolean;
}

/**
 * Renders notification badge.
 * Shows when there are unseen friend requests or acceptance notifications.
 */
export function NotificationBadge({
  className,
  showBell = true,
}: Readonly<NotificationBadgeProps>) {
  const { unreadFriendRequestCount, acceptanceNotifications } =
    useNotificationStore();

  // Aggregate notifications (pending requests + acceptance notifications)
  const totalNotifications =
    unreadFriendRequestCount + acceptanceNotifications.length;

  if (showBell) {
    // Version with Bell icon (standalone usage)
    return (
      <div className={cn("relative inline-block", className)}>
        <Bell className="h-5 w-5" />
        {totalNotifications > 0 && (
          <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
            {totalNotifications > 9 ? "9+" : totalNotifications}
          </span>
        )}
      </div>
    );
  }

  // Version without Bell icon (when the parent already renders Bell)
  return totalNotifications > 0 ? (
    <span
      className={cn(
        "ml-2 inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white animate-pulse",
        className,
      )}
    >
      {totalNotifications > 9 ? "9+" : totalNotifications}
    </span>
  ) : null;
}
