import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  className?: string;
  showBell?: boolean;
}

/**
 * Bell icon with animated ring + pop badge.
 * Triggers bell-ring animation whenever the total count increases.
 */
export function NotificationBadge({
  className,
  showBell = true,
}: Readonly<NotificationBadgeProps>) {
  const { unreadFriendRequestCount, acceptanceNotifications, unreadSocialCount } =
    useNotificationStore();

  // Total across all notification types
  const total =
    unreadFriendRequestCount + acceptanceNotifications.length + unreadSocialCount;

  // Trigger ring animation only when count goes UP
  const [ringing, setRinging] = useState(false);
  const prevTotal = useRef(total);

  useEffect(() => {
    if (total > prevTotal.current) {
      setRinging(false);
      // Force re-mount the animation class
      const raf = requestAnimationFrame(() => {
        setRinging(true);
        const timer = setTimeout(() => setRinging(false), 1100);
        return () => clearTimeout(timer);
      });
      return () => cancelAnimationFrame(raf);
    }
    prevTotal.current = total;
  }, [total]);

  const count = total > 99 ? "99+" : total;

  if (showBell) {
    return (
      <div className={cn("relative inline-flex items-center justify-center", className)}>
        <Bell
          className={cn(
            "h-5 w-5 transition-colors",
            total > 0 ? "text-foreground" : "text-muted-foreground",
            ringing && "bell-ring",
          )}
        />
        {total > 0 && (
          <span
            key={total} // re-mount triggers badge-pop each time count changes
            className="badge-pop absolute -right-2 -top-2 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white shadow-sm"
          >
            {count}
          </span>
        )}
      </div>
    );
  }

  // Inline badge only (parent already renders Bell icon)
  return total > 0 ? (
    <span
      key={total}
      className={cn(
        "badge-pop ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-white shadow-sm",
        className,
      )}
    >
      {count}
    </span>
  ) : null;
}
