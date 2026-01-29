import { useNotificationStore } from "@/stores/useNotificationStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useEffect } from "react";

/**
 * Component hiển thị danh sách lời mời kết bạn chưa xem
 */
export function PendingFriendRequests() {
  const { pendingRequests, clearPendingRequests } = useNotificationStore();

  // Clear pending requests sau 5 giây
  useEffect(() => {
    if (pendingRequests.length > 0) {
      const timer = setTimeout(() => {
        clearPendingRequests();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [pendingRequests, clearPendingRequests]);

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">
        Lời mời kết bạn mới
      </p>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {pendingRequests.map((request) => (
          <div
            key={request._id}
            className="flex items-center gap-3 p-2 bg-white dark:bg-slate-800 rounded border border-blue-100 dark:border-slate-700"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={request.from?.avatarUrl}
                alt={request.from?.displayName}
              />
              <AvatarFallback>
                {request.from?.displayName?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {request.from?.displayName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                @{request.from?.username}
              </p>
            </div>
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
