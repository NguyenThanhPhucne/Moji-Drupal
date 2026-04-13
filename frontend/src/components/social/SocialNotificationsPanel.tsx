import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellOff,
  CheckCheck,
  Clock3,
  Inbox,
  Heart,
  MessageCircle,
  Users,
  UserCheck,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn, getStaggerEnterClass } from "@/lib/utils";
import type { SocialNotification } from "@/types/social";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  isNotificationPresetActive,
  NOTIFICATION_PRESETS,
  type DeliveryPreferences,
  type NotificationPresetKey,
  type SocialPreferences,
} from "@/lib/notificationPreferences";

// ─── Type icon mapping ────────────────────────────────────────────────────────
const TYPE_META: Record<
  SocialNotification["type"],
  { Icon: React.FC<{ className?: string }>; colorClass: string }
> = {
  like:            { Icon: Heart,         colorClass: "notification-kind-like-bg" },
  comment:         { Icon: MessageCircle, colorClass: "notification-kind-comment-bg" },
  follow:          { Icon: Users,         colorClass: "notification-kind-follow-bg" },
  system:          { Icon: Bell,          colorClass: "notification-kind-system-bg" },
  friend_accepted: { Icon: UserCheck,     colorClass: "notification-kind-friend-accepted-bg" },
};

// ─── Skeleton premium ─────────────────────────────────────────────────────────
const SKEL_KEYS = ["sk1", "sk2", "sk3", "sk4"];

const NotificationSkeleton = ({
  compact,
  count = 4,
}: {
  compact?: boolean;
  count?: number;
}) => (
  <>
    {SKEL_KEYS.slice(0, count).map((key, i) => (
      <div
        key={key}
        className={cn(
          "flex items-start gap-3 rounded-xl px-3 py-2.5",
          getStaggerEnterClass(i),
        )}
      >
        <Skeleton className="h-10 w-10 flex-shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className={cn("h-3.5", compact ? "w-1/2" : "w-3/4")} />
          <Skeleton className="h-3 w-full" />
          {!compact && <Skeleton className="h-3 w-4/5" />}
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    ))}
  </>
);

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
      <Inbox className="h-6 w-6 text-muted-foreground" />
    </div>
    <p className="text-xs text-muted-foreground">No notifications yet</p>
  </div>
);

// ─── Props ────────────────────────────────────────────────────────────────────
interface SocialNotificationsPanelProps {
  notifications: SocialNotification[];
  loading?: boolean;
  compact?: boolean;
  onReadOne: (notificationId: string) => Promise<void>;
  onReadAll: () => Promise<void>;
  deliveryPreferences: DeliveryPreferences;
  socialPreferences: SocialPreferences;
  preferencesBusy?: boolean;
  onUpdateSocialPreferences: (updates: {
    muted?: boolean;
    follow?: boolean;
    like?: boolean;
    comment?: boolean;
    friendAccepted?: boolean;
    system?: boolean;
    mutedUserIds?: string[];
    mutedConversationIds?: string[];
    digestEnabled?: boolean;
    digestWindowHours?: number;
  }) => Promise<void>;
  onUpdateDeliveryPreferences: (updates: {
    message?: boolean;
    sound?: boolean;
    desktop?: boolean;
  }) => Promise<void>;
}

const TYPE_PREF_KEY: Record<
  SocialNotification["type"],
  "follow" | "like" | "comment" | "friendAccepted" | "system"
> = {
  follow: "follow",
  like: "like",
  comment: "comment",
  system: "system",
  friend_accepted: "friendAccepted",
};

const DIGEST_WINDOW_OPTIONS = [1, 3, 6, 12, 24];

type DeliveryPreferenceToggleKey = "message" | "sound" | "desktop";

// ─── Main component ───────────────────────────────────────────────────────────
const SocialNotificationsPanel = ({
  notifications,
  loading = false,
  compact = false,
  onReadOne,
  onReadAll,
  deliveryPreferences,
  socialPreferences,
  preferencesBusy = false,
  onUpdateSocialPreferences,
  onUpdateDeliveryPreferences,
}: SocialNotificationsPanelProps) => {
  const [showPreferences, setShowPreferences] = useState(false);

  type SocialPreferencesUpdate = Parameters<
    SocialNotificationsPanelProps["onUpdateSocialPreferences"]
  >[0];

  type SocialPreferenceToggleKey =
    | "muted"
    | "follow"
    | "like"
    | "comment"
    | "friendAccepted"
    | "system"
    | "digestEnabled";

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (socialPreferences.muted) {
        return false;
      }

      const actorId = String(notification.actorId?._id || "");
      if (
        actorId &&
        socialPreferences.mutedUserIds.includes(actorId)
      ) {
        return false;
      }

      const conversationId = String(notification.conversationId || "");
      if (
        conversationId &&
        socialPreferences.mutedConversationIds.includes(conversationId)
      ) {
        return false;
      }

      const prefKey = TYPE_PREF_KEY[notification.type];
      return Boolean(socialPreferences[prefKey]);
    });
  }, [notifications, socialPreferences]);

  const unread = filteredNotifications.filter((n) => !n.isRead).length;
  const visibleNotifications = useMemo(
    () => (compact ? filteredNotifications.slice(0, 5) : filteredNotifications.slice(0, 12)),
    [compact, filteredNotifications],
  );

  const digestWindowHours = useMemo(() => {
    const parsed = Number(socialPreferences.digestWindowHours || 6);
    if (!Number.isInteger(parsed)) {
      return 6;
    }

    return Math.min(24, Math.max(1, parsed));
  }, [socialPreferences.digestWindowHours]);

  const digestGroups = useMemo(() => {
    if (!socialPreferences.digestEnabled) {
      return [] as Array<{ bucketStart: number; items: SocialNotification[] }>;
    }

    const windowMs = digestWindowHours * 60 * 60 * 1000;
    const grouped = new Map<number, SocialNotification[]>();

    visibleNotifications.forEach((notification) => {
      const createdAtMs = new Date(notification.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) {
        return;
      }

      const bucketStart = Math.floor(createdAtMs / windowMs) * windowMs;
      const nextItems = grouped.get(bucketStart) || [];
      nextItems.push(notification);
      grouped.set(bucketStart, nextItems);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([bucketStart, items]) => ({ bucketStart, items }));
  }, [digestWindowHours, socialPreferences.digestEnabled, visibleNotifications]);

  const actorLabelById = useMemo(() => {
    const map = new Map<string, string>();

    notifications.forEach((notification) => {
      const actorId = String(notification.actorId?._id || "");
      if (!actorId) {
        return;
      }

      map.set(
        actorId,
        notification.actorId?.displayName || notification.actorId?.username || actorId,
      );
    });

    return map;
  }, [notifications]);

  const togglePreference = async (
    key: SocialPreferenceToggleKey,
    value: boolean,
  ) => {
    const payload: SocialPreferencesUpdate = { [key]: value };
    await onUpdateSocialPreferences(payload);
  };

  const toggleDeliveryPreference = async (
    key: DeliveryPreferenceToggleKey,
    value: boolean,
  ) => {
    await onUpdateDeliveryPreferences({ [key]: value });
  };

  const updateDigestWindow = async (nextHours: number) => {
    await onUpdateSocialPreferences({ digestWindowHours: nextHours });
  };

  const applyNotificationPreset = async (presetKey: NotificationPresetKey) => {
    const preset = NOTIFICATION_PRESETS[presetKey];
    const previousDelivery = { ...deliveryPreferences };
    const previousSocial = { ...socialPreferences };

    await Promise.all([
      onUpdateDeliveryPreferences({
        message: preset.delivery.message,
        sound: preset.delivery.sound,
        desktop: preset.delivery.desktop,
      }),
      onUpdateSocialPreferences({
        ...preset.social,
      }),
    ]);

    toast.success(`${preset.label} preset applied`, {
      action: {
        label: "Undo",
        onClick: () => {
          Promise.all([
            onUpdateDeliveryPreferences({
              message: previousDelivery.message,
              sound: previousDelivery.sound,
              desktop: previousDelivery.desktop,
            }),
            onUpdateSocialPreferences({
              ...previousSocial,
            }),
          ]).catch((error) => {
            console.error("Failed to undo notification preset", error);
          });
        },
      },
    });
  };

  const muteActor = async (actorId: string) => {
    const normalizedActorId = String(actorId || "").trim();
    if (!normalizedActorId) {
      return;
    }

    if (socialPreferences.mutedUserIds.includes(normalizedActorId)) {
      return;
    }

    await onUpdateSocialPreferences({
      mutedUserIds: [...socialPreferences.mutedUserIds, normalizedActorId],
    });
  };

  const unmuteActor = async (actorId: string) => {
    await onUpdateSocialPreferences({
      mutedUserIds: socialPreferences.mutedUserIds.filter((item) => item !== actorId),
    });
  };

  const muteConversation = async (conversationId: string) => {
    const normalizedConversationId = String(conversationId || "").trim();
    if (!normalizedConversationId) {
      return;
    }

    if (socialPreferences.mutedConversationIds.includes(normalizedConversationId)) {
      return;
    }

    await onUpdateSocialPreferences({
      mutedConversationIds: [
        ...socialPreferences.mutedConversationIds,
        normalizedConversationId,
      ],
    });
  };

  const unmuteConversation = async (conversationId: string) => {
    await onUpdateSocialPreferences({
      mutedConversationIds: socialPreferences.mutedConversationIds.filter(
        (item) => item !== conversationId,
      ),
    });
  };

  const renderNotificationItem = (
    notification: SocialNotification,
    index: number,
  ) => {
    const meta = TYPE_META[notification.type] ?? TYPE_META.system;
    const { Icon, colorClass } = meta;

    return (
      <div
        key={notification._id}
        className={cn(
          "group rounded-xl transition-all duration-150",
          getStaggerEnterClass(index),
          compact ? "px-2.5 py-2" : "px-3 py-2.5",
          notification.isRead
            ? "hover:bg-muted/50"
            : "bg-primary/[0.07] hover:bg-primary/[0.12]",
        )}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onReadOne(notification._id)}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "relative flex-shrink-0 mt-0.5 rounded-full",
                  !notification.isRead && "social-pulse-glow-unread",
                )}
              >
                <Avatar
                  className={cn(
                    "ring-2 ring-background relative z-10",
                    compact ? "h-9 w-9" : "h-10 w-10",
                  )}
                >
                  <AvatarImage
                    src={notification.actorId.avatarUrl ?? undefined}
                    alt={notification.actorId.displayName}
                  />
                  <AvatarFallback className="avatar-fallback-accent text-xs font-semibold">
                    {notification.actorId.displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full ring-2 ring-background",
                    compact ? "h-3.5 w-3.5" : "h-4 w-4",
                    colorClass,
                  )}
                >
                  <Icon
                    className={cn(
                      compact ? "h-2 w-2" : "h-2.5 w-2.5",
                      "text-white",
                    )}
                  />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "line-clamp-2 leading-snug",
                    compact ? "text-[12px]" : "text-sm",
                  )}
                >
                  <span className="font-semibold text-foreground">
                    {notification.actorId.displayName}
                  </span>{" "}
                  <span className="text-foreground/80">{notification.message}</span>
                </p>

                <p
                  className={cn(
                    "mt-0.5",
                    compact ? "text-[11px]" : "text-xs",
                    notification.isRead
                      ? "text-muted-foreground"
                      : "font-medium text-primary",
                  )}
                >
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>

              {!notification.isRead && (
                <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary ring-2 ring-background" />
              )}
            </div>
          </button>

          <div className="flex items-center gap-1 pt-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={preferencesBusy}
              onClick={() => {
                muteActor(String(notification.actorId?._id || "")).catch((error) => {
                  console.error("Failed to mute actor", error);
                });
              }}
              title="Mute this person"
            >
              <BellOff className="size-3.5 text-muted-foreground" />
            </Button>

            {notification.conversationId && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={preferencesBusy}
                onClick={() => {
                  muteConversation(String(notification.conversationId || "")).catch((error) => {
                    console.error("Failed to mute conversation", error);
                  });
                }}
                title="Mute this group"
              >
                <Users className="size-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "social-card social-notification-glass flex flex-col gap-0 overflow-hidden",
        "p-0",
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-center justify-between border-b border-border/60",
          compact ? "px-3 py-2.5" : "px-4 py-3",
        )}
      >
        <div className="flex items-center gap-2">
          <Bell className={cn(compact ? "h-4 w-4" : "h-5 w-5", "text-foreground")} />
          <h3
            className={cn(
              "font-semibold text-foreground",
              compact ? "text-sm" : "text-base",
            )}
          >
            Notifications
          </h3>
          {unread > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPreferences((current) => !current)}
            className={cn(
              "gap-1 text-muted-foreground hover:text-foreground",
              compact ? "h-7 px-2" : "h-8 px-2.5",
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="sr-only">Notification preferences</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReadAll}
            disabled={unread === 0}
            className={cn(
              "gap-1.5 text-muted-foreground hover:text-foreground",
              compact ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-xs",
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {!compact && <span>Mark as read</span>}
            {compact && <span className="sr-only">Mark as read</span>}
          </Button>
        </div>
      </div>

      {showPreferences && (
        <div className="border-b border-border/60 px-3 py-2.5 bg-muted/20 space-y-2">
          <div className="space-y-2 border-b border-border/60 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Quick presets
            </p>

            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(NOTIFICATION_PRESETS) as NotificationPresetKey[]).map((presetKey) => {
                const preset = NOTIFICATION_PRESETS[presetKey];
                const active = isNotificationPresetActive(
                  presetKey,
                  deliveryPreferences,
                  socialPreferences,
                );

                return (
                  <button
                    key={presetKey}
                    type="button"
                    disabled={preferencesBusy}
                    onClick={() => {
                      applyNotificationPreset(presetKey).catch((error) => {
                        console.error("Failed to apply notification preset", error);
                      });
                    }}
                    className={cn(
                      "micro-tap-chip rounded-lg border px-2 py-1.5 text-left transition-colors",
                      active
                        ? "border-primary/45 bg-primary/10"
                        : "border-border/70 bg-background/80 hover:border-primary/30 hover:bg-muted/30",
                    )}
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
                      <preset.Icon className="size-3" />
                      {preset.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground line-clamp-2">
                      {preset.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-b border-border/60 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Delivery
            </p>

            <div className="grid grid-cols-1 gap-1.5">
              {[
                {
                  key: "message" as const,
                  label: "Message notifications",
                  description: "Show message and activity notifications",
                },
                {
                  key: "sound" as const,
                  label: "Sound",
                  description: "Play alert sound for incoming notifications",
                },
                {
                  key: "desktop" as const,
                  label: "Desktop alerts",
                  description: "Show browser-level notifications",
                },
              ].map(({ key, label, description }) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-foreground/90">
                      {label}
                    </span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {description}
                    </span>
                  </span>
                  <Switch
                    checked={deliveryPreferences[key]}
                    disabled={preferencesBusy || (!deliveryPreferences.message && key !== "message")}
                    onCheckedChange={(checked) => {
                      toggleDeliveryPreference(key, checked).catch((error) => {
                        console.error("Failed to update delivery preference", error);
                      });
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Quiet mode
            </p>
            <Switch
              checked={socialPreferences.muted}
              disabled={preferencesBusy}
              onCheckedChange={(checked) => {
                togglePreference("muted", checked).catch((error) => {
                  console.error("Failed to update social preference", error);
                });
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {[
              { key: "follow" as const, label: "Follows" },
              { key: "like" as const, label: "Likes" },
              { key: "comment" as const, label: "Comments" },
              { key: "friendAccepted" as const, label: "Friend accepted" },
              { key: "system" as const, label: "System" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-2 text-xs text-foreground/85">
                <span>{label}</span>
                <Switch
                  checked={socialPreferences[key]}
                  disabled={preferencesBusy || socialPreferences.muted}
                  onCheckedChange={(checked) => {
                    togglePreference(key, checked).catch((error) => {
                      console.error("Failed to update social preference", error);
                    });
                  }}
                />
              </label>
            ))}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Digest mode
              </p>
              <Switch
                checked={socialPreferences.digestEnabled}
                disabled={preferencesBusy || socialPreferences.muted}
                onCheckedChange={(checked) => {
                  togglePreference("digestEnabled", checked).catch((error) => {
                    console.error("Failed to update digest preference", error);
                  });
                }}
              />
            </div>

            {socialPreferences.digestEnabled && (
              <div className="flex flex-wrap gap-1.5">
                {DIGEST_WINDOW_OPTIONS.map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    disabled={preferencesBusy}
                    onClick={() => {
                      updateDigestWindow(hours).catch((error) => {
                        console.error("Failed to update digest window", error);
                      });
                    }}
                    className={cn(
                      "micro-tap-chip rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      digestWindowHours === hours
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-border/70 bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {hours}h
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground mb-1.5">
                Muted people
              </p>
              <div className="flex flex-wrap gap-1.5">
                {socialPreferences.mutedUserIds.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">None</span>
                )}

                {socialPreferences.mutedUserIds.map((actorId) => (
                  <button
                    key={actorId}
                    type="button"
                    onClick={() => {
                      unmuteActor(actorId).catch((error) => {
                        console.error("Failed to unmute actor", error);
                      });
                    }}
                    className="micro-tap-chip rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground/85 hover:bg-muted/60"
                  >
                    {actorLabelById.get(actorId) || `User ${actorId.slice(-6)}`} · Unmute
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground mb-1.5">
                Muted groups
              </p>
              <div className="flex flex-wrap gap-1.5">
                {socialPreferences.mutedConversationIds.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">None</span>
                )}

                {socialPreferences.mutedConversationIds.map((conversationId) => (
                  <button
                    key={conversationId}
                    type="button"
                    onClick={() => {
                      unmuteConversation(conversationId).catch((error) => {
                        console.error("Failed to unmute conversation", error);
                      });
                    }}
                    className="micro-tap-chip rounded-full border border-border/70 bg-background px-2 py-1 text-[11px] text-foreground/85 hover:bg-muted/60"
                  >
                    Group {conversationId.slice(-6)} · Unmute
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification list ── */}
      <div
        className={cn(
          "overflow-y-auto beautiful-scrollbar",
          compact
            ? "max-h-[36svh] p-1.5"
            : "max-h-[calc(100svh-10rem)] p-2",
        )}
      >
        {loading && notifications.length === 0 && (
          <NotificationSkeleton compact={compact} count={compact ? 3 : 4} />
        )}

        {!loading && notifications.length === 0 && <EmptyState />}

        {!loading && notifications.length > 0 && visibleNotifications.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              Notifications are hidden by your preferences
            </p>
            <button
              type="button"
              onClick={() => setShowPreferences(true)}
              className="micro-tap-chip text-[11px] text-primary hover:underline"
            >
              Review preferences
            </button>
          </div>
        )}

        {socialPreferences.digestEnabled && digestGroups.length > 0 &&
          digestGroups.map((group, groupIndex) => (
            <section
              key={group.bucketStart}
              className={cn("space-y-1.5", getStaggerEnterClass(groupIndex))}
            >
              <div className="sticky top-0 z-[1] flex items-center gap-1.5 rounded-md border border-border/60 bg-background/90 px-2.5 py-1.5 text-[11px] text-muted-foreground backdrop-blur">
                <Clock3 className="size-3.5" />
                <span>
                  Digest bucket {new Date(group.bucketStart).toLocaleString()} · {group.items.length} items
                </span>
              </div>
              {group.items.map((notification, itemIndex) =>
                renderNotificationItem(notification, groupIndex * 10 + itemIndex),
              )}
            </section>
          ))}

        {!socialPreferences.digestEnabled &&
          visibleNotifications.map((notification, index) =>
            renderNotificationItem(notification, index),
          )}
      </div>
    </aside>
  );
};

export default SocialNotificationsPanel;
