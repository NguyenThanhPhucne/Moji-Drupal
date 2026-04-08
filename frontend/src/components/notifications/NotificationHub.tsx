import { useMemo, useState } from "react";
import { isToday, subDays, isAfter } from "date-fns";
import { CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/stores/useNotificationStore";
import { useFriendStore } from "@/stores/useFriendStore";
import { useSocialStore } from "@/stores/useSocialStore";
import { useChatStore } from "@/stores/useChatStore";
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
  new: "New",
  today: "Today",
  earlier: "Earlier",
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
const SKEL_KEYS = ["s1", "s2", "s3", "s4", "s5"];

const NotificationHubSkeleton = () => (
  <div className="divide-y divide-border/40">
    {SKEL_KEYS.map((key) => (
      <div key={key} className="flex items-start gap-3 px-4 py-3.5">
        <Skeleton className="h-11 w-11 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    ))}
  </div>
);

// ─── Empty state ─────────────────────────────────────────────────────────────
 const EmptyState = () => (
  <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 py-10 text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
      <Inbox className="h-7 w-7 text-muted-foreground/70" />
    </div>
    <div className="space-y-0.5">
      <p className="text-[14px] font-semibold text-foreground">You're all caught up</p>
      <p className="text-[12.5px] text-muted-foreground">
        New notifications will appear here
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
  const [chatCreating, setChatCreating] = useState<string | null>(null);

  const {
    acceptanceNotifications,
    socialNotifications,
    resetUnreadCount,
  } = useNotificationStore();

  const { markNotificationRead, markAllNotificationsRead } = useSocialStore();
  const { createConversation, setIsHubOpen } = {
    createConversation: useChatStore((s) => s.createConversation),
    setIsHubOpen: useNotificationStore((s) => s.setIsHubOpen),
  };

  const {
    receivedList: pendingRequests,
    acceptRequest,
    declineRequest,
    removeReceivedRequest,
    seenRequests,
    markRequestSeen,
  } = useFriendStore();

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
        message: "sent you a friend request",
        isRead: seenRequests.includes(req._id),
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

    // 3. Social notifications (follow / like / comment / friend_accepted from DB)
    for (const notif of socialNotifications) {
      // friend_accepted stored in DB — map correctly so they show "Chat now" CTA
      const kindMap: Record<string, import("./NotificationItem").NotificationKind> = {
        follow: "follow",
        like: "like",
        comment: "comment",
        friend_accepted: "friend_accepted",
        system: "system",
      };
      items.push({
        id: notif._id,
        kind: kindMap[notif.type] ?? "system",
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
  }, [pendingRequests, acceptanceNotifications, socialNotifications, seenRequests]);

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
      markNotificationRead(id);
    } else if (id.startsWith("fr-")) {
      markRequestSeen(id.replace("fr-", ""));
    }
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
      removeReceivedRequest(reqId);
    } else {
      markNotificationRead(id);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    resetUnreadCount();
    toast.success("Marked all as read");
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <h2 className="text-[18px] font-bold text-foreground tracking-tight">Notifications</h2>

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
          Mark all
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
            All
          </TabsTrigger>
          <TabsTrigger
            value="unread"
            className="rounded-none pb-2.5 px-1 text-[14px] font-semibold text-muted-foreground data-[state=active]:text-primary data-[state=active]:shadow-[0_2px_0_0_hsl(var(--primary))] bg-transparent shadow-none transition-colors"
          >
            Unread
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
          className="flex-1 overflow-y-auto px-2 pb-4 pt-1 data-[state=inactive]:hidden beautiful-scrollbar"
        >
          {loading && unified.length === 0 ? (
            <NotificationHubSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-0.5 py-1">
              {(["new", "today", "earlier"] as const).map((group) => {
                const items = grouped[group];
                if (items.length === 0) return null;

                return (
                  <div key={group}>
                    {/* Group label */}
                    <div className="px-3 pb-1 pt-3">
                      <h3 className="text-[12px] font-bold text-muted-foreground uppercase tracking-widest">
                        {GROUP_LABELS[group as keyof typeof GROUP_LABELS]}
                      </h3>
                    </div>

                    {/* Items */}
                    {items.map((notification) => (
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
                            ? () => handleOpenDirectChat(
                                notification.actor._id,
                                notification.actor.displayName,
                                notification.id,
                              )
                            : undefined
                        }
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
