import { useCallback, useMemo, useState, type ReactNode } from "react";
import { isToday, subDays, isAfter } from "date-fns";
import { CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { Virtuoso } from "react-virtuoso";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocialStore } from "@/stores/useSocialStore";
import { useChatStore } from "@/stores/useChatStore";
import { useSocketStore } from "@/stores/useSocketStore";
import { usePersonalizationStore } from "@/stores/usePersonalizationStore";
import { useI18n } from "@/lib/i18n";
import NotificationItem, {
  type UnifiedNotification,
} from "./NotificationItem";

// ─── Helpers ──────────────────────────────────────────────────────────────────
type NotificationTimeGroup = "new" | "today" | "earlier";
type NotificationPriority = "high" | "normal" | "low";

const getGroup = (dateStr: string): NotificationTimeGroup => {
  const date = new Date(dateStr);
  const tenMinutesAgo = subDays(new Date(), 0);
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 10);

  if (isAfter(date, tenMinutesAgo)) return "new";
  if (isToday(date)) return "today";
  return "earlier";
};

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

const getNotificationPriority = (
  kind: UnifiedNotification["kind"],
): NotificationPriority => {
  if (kind === "friend_request" || kind === "friend_accepted" || kind === "mention") {
    return "high";
  }

  if (kind === "comment" || kind === "follow") {
    return "normal";
  }

  return "low";
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const SKEL_KEYS = ["s1", "s2", "s3", "s4", "s5"];

const NotificationHubSkeleton = () => (
  <div className="divide-y divide-border/40">
    {SKEL_KEYS.map((key) => (
      <div key={key} className="flex items-start gap-3 px-4 py-3.5">
        <div className="h-11 w-11 rounded-full flex-shrink-0 bg-muted skeleton-shimmer" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3.5 w-4/5 rounded bg-muted skeleton-shimmer" />
          <div className="h-3 w-full rounded bg-muted skeleton-shimmer" />
          <div className="h-3 w-1/4 rounded bg-muted skeleton-shimmer" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Empty state ─────────────────────────────────────────────────────────────
const EmptyState = () => {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Inbox className="h-7 w-7 text-muted-foreground/70" />
      </div>
      <div className="space-y-0.5">
        <p className="text-[14px] font-semibold text-foreground">
          {t("notifications.empty_title")}
        </p>
        <p className="text-[12.5px] text-muted-foreground">
          {t("notifications.empty_description")}
        </p>
      </div>
    </div>
  );
};

type NotificationHubRow =
  | { rowType: "header"; id: string; label: string }
  | { rowType: "item"; id: string; notification: UnifiedNotification };

// ─── Main component ───────────────────────────────────────────────────────────
interface NotificationHubProps {
  loading?: boolean;
}

const NotificationHub = ({ loading = false }: NotificationHubProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [chatCreating, setChatCreating] = useState<string | null>(null);
  const notificationPriorityCenterEnabled = useSocketStore(
    (state) => state.featureFlags.notification_priority_center,
  );
  const notificationGroupingPreference = usePersonalizationStore(
    (state) => state.notificationGroupingPreference,
  );

  const acceptanceNotifications = useNotificationStore((s) => s.acceptanceNotifications);
  const socialNotifications = useNotificationStore((s) => s.socialNotifications);
  const resetUnreadCount = useNotificationStore((s) => s.resetUnreadCount);

  const markNotificationRead = useSocialStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useSocialStore((s) => s.markAllNotificationsRead);
  
  const createConversation = useChatStore((s) => s.createConversation);
  const setIsHubOpen = useNotificationStore((s) => s.setIsHubOpen);

  const pendingRequests = useFriendStore((s) => s.receivedList);
  const acceptRequest = useFriendStore((s) => s.acceptRequest);
  const declineRequest = useFriendStore((s) => s.declineRequest);
  const removeReceivedRequest = useFriendStore((s) => s.removeReceivedRequest);
  const seenRequests = useFriendStore((s) => s.seenRequests);
  const markRequestSeen = useFriendStore((s) => s.markRequestSeen);

  const priorityGroupingEnabled = useMemo(() => {
    if (notificationGroupingPreference === "priority") {
      return true;
    }

    if (notificationGroupingPreference === "time") {
      return false;
    }

    return notificationPriorityCenterEnabled;
  }, [notificationGroupingPreference, notificationPriorityCenterEnabled]);

  // ── Build unified list ────────────────────────────────────────────────────
  const unified = useMemo<UnifiedNotification[]>(() => {
    const items: UnifiedNotification[] = [];

    // 1. Incoming friend requests (always unread until dismissed)
    for (const req of pendingRequests) {
      const kind: UnifiedNotification["kind"] = "friend_request";
      items.push({
        id: `fr-${req._id}`,
        kind,
        priority: getNotificationPriority(kind),
        actor: {
          _id: req.from?._id ?? "",
          displayName: req.from?.displayName ?? "Someone",
          avatarUrl: req.from?.avatarUrl ?? null,
        },
        message: "sent you a friend request",
        introMessage: req.message,
        isRead: seenRequests.includes(req._id),
        createdAt: req.createdAt,
        requestId: req._id,
      });
    }

    // 2. Accepted friend notifications
    for (const notif of acceptanceNotifications) {
      const kind: UnifiedNotification["kind"] = "friend_accepted";
      items.push({
        id: `fa-${notif.from._id}-${new Date(notif.createdAt).getTime()}`,
        kind,
        priority: getNotificationPriority(kind),
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

    // 3. Social notifications (follow / like / comment / friend_accepted from DB)
    for (const notif of socialNotifications) {
      // friend_accepted stored in DB — map correctly so they show "Chat now" CTA
      const kindMap: Record<string, import("./NotificationItem").NotificationKind> = {
        follow: "follow",
        like: "like",
        comment: "comment",
        mention: "mention",
        friend_accepted: "friend_accepted",
        system: "system",
      };
      const kind = kindMap[notif.type] ?? "system";
      items.push({
        id: notif._id,
        kind,
        priority: getNotificationPriority(kind),
        actor: {
          _id: notif.actorId._id,
          displayName: notif.actorId.displayName,
          avatarUrl: notif.actorId.avatarUrl ?? null,
        },
        message: notif.message,
        isRead: notif.isRead,
        createdAt: notif.createdAt,
        conversationId: notif.conversationId || null,
      });
    }

    // Sort newest first
    return items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [pendingRequests, acceptanceNotifications, socialNotifications, seenRequests]);

  const listForDisplay = useMemo<UnifiedNotification[]>(() => {
    if (!priorityGroupingEnabled) {
      return unified;
    }

    const groupedByConversation = new Map<string, UnifiedNotification[]>();
    const passthrough: UnifiedNotification[] = [];

    unified.forEach((notification) => {
      const conversationId = String(notification.conversationId || "").trim();
      const isHighPriority = (notification.priority || "normal") === "high";

      if (isHighPriority || !conversationId) {
        passthrough.push(notification);
        return;
      }

      const existing = groupedByConversation.get(conversationId) || [];
      groupedByConversation.set(conversationId, [...existing, notification]);
    });

    groupedByConversation.forEach((items, conversationId) => {
      if (items.length === 1) {
        passthrough.push(items[0]);
        return;
      }

      const sortedItems = [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const latestItem = sortedItems[0];

      passthrough.push({
        id: `conv-bundle-${conversationId}`,
        kind: "system",
        priority: "normal",
        actor: latestItem.actor,
        message: t("notifications.bundle_message", { count: items.length }),
        isRead: items.every((item) => item.isRead),
        createdAt: latestItem.createdAt,
        conversationId,
        aggregatedCount: items.length,
        aggregatedNotificationIds: items.map((item) => item.id),
      });
    });

    return passthrough.sort((firstItem, secondItem) => {
      const firstPriority = PRIORITY_RANK[firstItem.priority || "normal"];
      const secondPriority = PRIORITY_RANK[secondItem.priority || "normal"];

      if (firstPriority !== secondPriority) {
        return firstPriority - secondPriority;
      }

      return (
        new Date(secondItem.createdAt).getTime() -
        new Date(firstItem.createdAt).getTime()
      );
    });
  }, [priorityGroupingEnabled, t, unified]);

  const filtered =
    tab === "unread" ? listForDisplay.filter((item) => !item.isRead) : listForDisplay;
  const unreadCount = unified.filter((item) => !item.isRead).length;

  const notificationById = useMemo(() => {
    return new Map(listForDisplay.map((notification) => [notification.id, notification]));
  }, [listForDisplay]);

  const groupedByTime = useMemo(() => {
    const result: Record<NotificationTimeGroup, UnifiedNotification[]> = {
      new: [],
      today: [],
      earlier: [],
    };

    for (const item of filtered) {
      result[getGroup(item.createdAt)].push(item);
    }

    return result;
  }, [filtered]);

  const groupedByPriority = useMemo(() => {
    const result: Record<NotificationPriority, UnifiedNotification[]> = {
      high: [],
      normal: [],
      low: [],
    };

    filtered.forEach((item) => {
      const priority = item.priority || "normal";
      result[priority].push(item);
    });

    return result;
  }, [filtered]);

  const resolvePriorityLabel = useCallback(
    (priority: NotificationPriority) => {
      if (priority === "high") {
        return t("notifications.priority.high");
      }

      if (priority === "normal") {
        return t("notifications.priority.normal");
      }

      return t("notifications.priority.low");
    },
    [t],
  );

  const resolveTimeGroupLabel = useCallback(
    (group: NotificationTimeGroup) => {
      if (group === "new") {
        return t("notifications.group.new");
      }

      if (group === "today") {
        return t("notifications.group.today");
      }

      return t("notifications.group.earlier");
    },
    [t],
  );

  const virtualRows = useMemo<NotificationHubRow[]>(() => {
    const rows: NotificationHubRow[] = [];

    if (priorityGroupingEnabled) {
      for (const priority of ["high", "normal", "low"] as const) {
        const items = groupedByPriority[priority];
        if (!items.length) {
          continue;
        }

        rows.push({
          rowType: "header",
          id: `priority-${priority}`,
          label: resolvePriorityLabel(priority),
        });

        items.forEach((notification) => {
          rows.push({
            rowType: "item",
            id: notification.id,
            notification,
          });
        });
      }

      return rows;
    }

    for (const group of ["new", "today", "earlier"] as const) {
      const items = groupedByTime[group];
      if (!items.length) {
        continue;
      }

      rows.push({
        rowType: "header",
        id: `header-${group}`,
        label: resolveTimeGroupLabel(group),
      });

      for (const notification of items) {
        rows.push({
          rowType: "item",
          id: notification.id,
          notification,
        });
      }
    }

    return rows;
  }, [
    groupedByPriority,
    groupedByTime,
    priorityGroupingEnabled,
    resolvePriorityLabel,
    resolveTimeGroupLabel,
  ]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleRead = (id: string) => {
    const targetNotification = notificationById.get(id);
    const aggregatedIds = targetNotification?.aggregatedNotificationIds || [];

    if (aggregatedIds.length > 0) {
      aggregatedIds.forEach((notificationId) => {
        markNotificationRead(notificationId);
      });
      return;
    }

    // Social notification
    if (!id.startsWith("fr-") && !id.startsWith("fa-")) {
      markNotificationRead(id);
    } else if (id.startsWith("fr-")) {
      markRequestSeen(id.replace("fr-", ""));
    }
  };

  const handleDismiss = (id: string) => {
    const targetNotification = notificationById.get(id);
    const aggregatedIds = targetNotification?.aggregatedNotificationIds || [];

    if (aggregatedIds.length > 0) {
      aggregatedIds.forEach((notificationId) => {
        markNotificationRead(notificationId);
      });
      return;
    }

    if (id.startsWith("fa-")) {
      const index = acceptanceNotifications.findIndex(
        (n) => `fa-${n.from._id}-${new Date(n.createdAt).getTime()}` === id,
      );
      if (index !== -1) {
        useNotificationStore.getState().removeAcceptanceNotification(index);
      }
    } else if (id.startsWith("fr-")) {
      const reqId = id.replace("fr-", "");
      removeReceivedRequest(reqId);
    } else {
      markNotificationRead(id);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    resetUnreadCount();
    toast.success(t("notifications.mark_all_success"));
  };

  const handleAcceptFriend = async (requestId: string) => {
    setProcessingId(`fr-${requestId}`);
    try {
      await acceptRequest(requestId);
      toast.success("Friend request accepted!");
    } catch {
      toast.error("Couldn't accept the request. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineFriend = async (requestId: string) => {
    setProcessingId(`fr-${requestId}`);
    try {
      await declineRequest(requestId);
      toast.info("Friend request declined");
    } catch {
      toast.error("Couldn't decline the request. Please try again.");
    } finally {
      setProcessingId(null);
    }
  };

  /** Click on a friend_accepted notification → instantly open a direct chat */
  const handleOpenDirectChat = async (actorId: string, actorName: string, notifId: string) => {
    if (chatCreating === notifId) return;
    setChatCreating(notifId);
    try {
      const success = await createConversation("direct", "", [actorId]);
      if (success) {
        // Dismiss the notification & close the hub
        handleDismiss(notifId);
        setIsHubOpen(false);
        toast.success(`Chat with ${actorName} opened successfully!`);
      } else {
        toast.error("Couldn't open the chat. Please try again!");
      }
    } catch {
      toast.error("Something went wrong. Please try again!");
    } finally {
      setChatCreating(null);
    }
  };

  const renderVirtualRow = useCallback(
    (_: number, row: NotificationHubRow) => {
      if (row.rowType === "header") {
        return (
          <div className="px-3 pb-1 pt-3">
            <h3
              className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest"
              data-testid="notification-group-header"
            >
              {row.label}
            </h3>
          </div>
        );
      }

      const notification = row.notification;

      return (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRead={handleRead}
          onDismiss={handleDismiss}
          onAcceptFriend={handleAcceptFriend}
          onDeclineFriend={handleDeclineFriend}
          loadingId={processingId ?? chatCreating}
          onOpenDirectChat={
            notification.kind === "friend_accepted"
              ? () =>
                  handleOpenDirectChat(
                    notification.actor._id,
                    notification.actor.displayName,
                    notification.id,
                  )
              : undefined
          }
        />
      );
    },
    [
      chatCreating,
      handleAcceptFriend,
      handleDeclineFriend,
      handleDismiss,
      handleOpenDirectChat,
      handleRead,
      processingId,
    ],
  );

  let contentNode: ReactNode;
  if (loading && unified.length === 0) {
    contentNode = <NotificationHubSkeleton />;
  } else if (filtered.length === 0) {
    contentNode = <EmptyState />;
  } else {
    contentNode = (
      <Virtuoso
        className="h-full beautiful-scrollbar"
        data={virtualRows}
        computeItemKey={(_, row) => row.id}
        increaseViewportBy={{ top: 180, bottom: 280 }}
        itemContent={renderVirtualRow}
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col" data-testid="notification-hub">
      {/* ── Header ── */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <h2 className="text-[18px] font-bold text-foreground tracking-tight">
          {t("notifications.title")}
        </h2>

        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors",
            unreadCount === 0
              ? "text-muted-foreground/50 cursor-default"
              : "text-primary hover:bg-primary/10 cursor-pointer",
          )}
        >
          <CheckCheck className="h-4 w-4" />
          {t("notifications.mark_all")}
        </button>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "all" | "unread")}
        className="flex flex-1 flex-col overflow-hidden"
      >
        {/* Tabs */}
        <TabsList className="flex gap-1 bg-transparent px-3 pt-1 pb-0 border-b border-border/40 rounded-none h-auto justify-start">
          <TabsTrigger
            value="all"
            className="rounded-none pb-2.5 px-1 text-[14px] font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:shadow-[0_2px_0_0_hsl(var(--primary))] bg-transparent shadow-none transition-colors"
          >
            {t("notifications.tab.all")}
          </TabsTrigger>
          <TabsTrigger
            value="unread"
            className="rounded-none pb-2.5 px-1 text-[14px] font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:shadow-[0_2px_0_0_hsl(var(--primary))] bg-transparent shadow-none transition-colors"
          >
            {t("notifications.tab.unread")}
            {unreadCount > 0 && (
              <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Content */}
        <TabsContent
          value={tab}
          forceMount
          className="flex-1 overflow-hidden px-2 pb-4 pt-1 data-[state=inactive]:hidden"
        >
          {contentNode}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NotificationHub;
