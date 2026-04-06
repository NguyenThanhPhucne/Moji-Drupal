import { useMemo, useState } from "react";
import { isToday, subDays, isAfter } from "date-fns";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useFriendStore } from "@/stores/useFriendStore";
import NotificationItem, {
  type UnifiedNotification,
} from "./NotificationItem";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getGroup = (dateStr: string): "new" | "today" | "earlier" => {
  const date = new Date(dateStr);
  const tenMinutesAgo = subDays(new Date(), 0);
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

  if (isAfter(date, tenMinutesAgo)) return "new";
  if (isToday(date)) return "today";
  return "earlier";
};

const GROUP_LABELS: Record<"new" | "today" | "earlier", string> = {
  new: "Mới",
  today: "Hôm nay",
  earlier: "Trước đó",
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const SKEL_KEYS = ["s1", "s2", "s3", "s4", "s5"];

const NotificationHubSkeleton = () => (
  <div className="space-y-1 p-1">
    {SKEL_KEYS.map((key) => (
      <div
        key={key}
        className="flex items-start gap-3 rounded-xl px-3 py-2.5"
      >
        <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
      <Inbox className="h-7 w-7 text-muted-foreground" />
    </div>
    <div>
      <p className="text-sm font-medium text-foreground">Chưa có thông báo</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Bạn sẽ thấy hoạt động mới ở đây
      </p>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
interface NotificationHubProps {
  loading?: boolean;
}

const NotificationHub = ({ loading = false }: NotificationHubProps) => {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const {
    pendingRequests,
    acceptanceNotifications,
    socialNotifications,
    resetUnreadCount,
    removePendingRequest,
    markSocialNotificationRead,
    markAllSocialNotificationsRead,
  } = useNotificationStore();

  const { acceptRequest, declineRequest } = useFriendStore();

  // ── Build unified list ────────────────────────────────────────────────────
  const unified = useMemo<UnifiedNotification[]>(() => {
    const items: UnifiedNotification[] = [];

    // 1. Incoming friend requests (always unread until dismissed)
    for (const req of pendingRequests) {
      items.push({
        id: `fr-${req._id}`,
        kind: "friend_request",
        actor: {
          _id: req.from?._id ?? "",
          displayName: req.from?.displayName ?? "Someone",
          avatarUrl: req.from?.avatarUrl ?? null,
        },
        message: "đã gửi cho bạn lời mời kết bạn",
        isRead: false,
        createdAt: req.createdAt,
        requestId: req._id,
      });
    }

    // 2. Accepted friend notifications
    for (const notif of acceptanceNotifications) {
      items.push({
        id: `fa-${notif.from._id}-${new Date(notif.createdAt).getTime()}`,
        kind: "friend_accepted",
        actor: {
          _id: notif.from._id,
          displayName: notif.from.displayName,
          avatarUrl: notif.from.avatarUrl ?? null,
        },
        message: notif.message,
        isRead: false, // these are transient; always unread until dismissed
        createdAt: new Date(notif.createdAt).toISOString(),
      });
    }

    // 3. Social notifications (follow / like / comment)
    for (const notif of socialNotifications) {
      items.push({
        id: notif._id,
        kind: notif.type === "follow" ? "follow" : notif.type === "like" ? "like" : notif.type === "comment" ? "comment" : "system",
        actor: {
          _id: notif.actorId._id,
          displayName: notif.actorId.displayName,
          avatarUrl: notif.actorId.avatarUrl ?? null,
        },
        message: notif.message,
        isRead: notif.isRead,
        createdAt: notif.createdAt,
      });
    }

    // Sort newest first
    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [pendingRequests, acceptanceNotifications, socialNotifications]);

  const filtered = tab === "unread" ? unified.filter((n) => !n.isRead) : unified;
  const unreadCount = unified.filter((n) => !n.isRead).length;

  // ── Grouping ──────────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const result: Record<"new" | "today" | "earlier", UnifiedNotification[]> = {
      new: [],
      today: [],
      earlier: [],
    };
    for (const item of filtered) {
      result[getGroup(item.createdAt)].push(item);
    }
    return result;
  }, [filtered]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRead = (id: string) => {
    // Social notification
    if (!id.startsWith("fr-") && !id.startsWith("fa-")) {
      markSocialNotificationRead(id);
    }
    // friend_request and friend_accepted are dismissed
  };

  const handleDismiss = (id: string) => {
    if (id.startsWith("fa-")) {
      const index = acceptanceNotifications.findIndex(
        (n) => `fa-${n.from._id}-${new Date(n.createdAt).getTime()}` === id,
      );
      if (index !== -1) {
        useNotificationStore.getState().removeAcceptanceNotification(index);
      }
    } else if (id.startsWith("fr-")) {
      const reqId = id.replace("fr-", "");
      removePendingRequest(reqId);
    } else {
      markSocialNotificationRead(id);
    }
  };

  const handleMarkAllRead = async () => {
    markAllSocialNotificationsRead();
    resetUnreadCount();
    toast.success("Đã đánh dấu tất cả là đã đọc");
  };

  const handleAcceptFriend = async (requestId: string) => {
    setProcessingId(`fr-${requestId}`);
    try {
      await acceptRequest(requestId);
      removePendingRequest(requestId);
      toast.success("Đã chấp nhận lời mời kết bạn!");
    } catch {
      toast.error("Không thể chấp nhận lời mời. Vui lòng thử lại.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineFriend = async (requestId: string) => {
    setProcessingId(`fr-${requestId}`);
    try {
      await declineRequest(requestId);
      removePendingRequest(requestId);
      toast.info("Đã từ chối lời mời kết bạn");
    } catch {
      toast.error("Không thể từ chối lời mời. Vui lòng thử lại.");
    } finally {
      setProcessingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 pb-3 pt-1">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">Thông báo</h2>
          {unreadCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Đánh dấu đã đọc
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "all" | "unread")}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <TabsList className="mx-4 mt-3 h-8 w-auto self-start rounded-lg bg-muted/60 p-0.5">
          <TabsTrigger value="all" className="h-7 px-3 text-xs">
            Tất cả
          </TabsTrigger>
          <TabsTrigger value="unread" className="h-7 px-3 text-xs">
            Chưa đọc
            {unreadCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Content */}
        <TabsContent
          value={tab}
          forceMount
          className="mt-2 flex-1 overflow-y-auto px-2 pb-3 data-[state=inactive]:hidden beautiful-scrollbar"
        >
          {loading && unified.length === 0 ? (
            <NotificationHubSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-1">
              {(["new", "today", "earlier"] as const).map((group) => {
                const items = grouped[group];
                if (items.length === 0) return null;

                return (
                  <div key={group}>
                    {/* Group label */}
                    <p className="mb-1 mt-3 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground first:mt-1">
                      {GROUP_LABELS[group]}
                    </p>

                    {/* Items */}
                    {items.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onRead={handleRead}
                        onDismiss={handleDismiss}
                        onAcceptFriend={handleAcceptFriend}
                        onDeclineFriend={handleDeclineFriend}
                        loadingId={processingId}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NotificationHub;
