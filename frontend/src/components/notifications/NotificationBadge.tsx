import { Bell } from "lucide-react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  className?: string;
  showBell?: boolean;
}

/**
 * Component hiển thị badge thông báo
 * Hiện lên khi có lời mời kết bạn chưa xem
 */
export function NotificationBadge({
  className,
  showBell = true,
}: NotificationBadgeProps) {
  const { unreadFriendRequestCount } = useNotificationStore();

  if (showBell) {
    // Version với Bell icon (dùng cho standalone)
    return (
      <div className={cn("relative inline-block", className)}>
        <Bell className="h-5 w-5" />
        {unreadFriendRequestCount > 0 && (
          <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadFriendRequestCount > 9 ? "9+" : unreadFriendRequestCount}
          </span>
        )}
      </div>
    );
  }

  // Version không có Bell icon (dùng khi Bell icon đã có ở đó)
  return (
    <>
      {unreadFriendRequestCount > 0 && (
        <span
          className={cn(
            "ml-2 inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500 text-white animate-pulse",
            className,
          )}
        >
          {unreadFriendRequestCount > 9 ? "9+" : unreadFriendRequestCount}
        </span>
      )}
    </>
  );
}
