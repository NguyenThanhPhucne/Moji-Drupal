import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import {
  DEFAULT_DELIVERY_PREFS,
  DEFAULT_SOCIAL_PREFS,
  DIGEST_WINDOW_OPTIONS,
  isNotificationPresetActive,
  normalizeDigestWindow,
  NOTIFICATION_PRESETS,
  type DeliveryPreferences,
  type NotificationPresetKey,
  type SocialPreferences,
} from "@/lib/notificationPreferences";

type NotificationPreferencesUpdatePayload = {
  message?: boolean;
  sound?: boolean;
  desktop?: boolean;
  social?: Partial<SocialPreferences>;
};

const NotificationPreferencesSettings = ({
  className,
}: {
  className?: string;
}) => {
  const { user, setUser } = useAuthStore();
  const [saving, setSaving] = useState(false);

  const deliveryPreferences = useMemo<DeliveryPreferences>(() => {
    return {
      message:
        user?.notificationPreferences?.message ?? DEFAULT_DELIVERY_PREFS.message,
      sound: user?.notificationPreferences?.sound ?? DEFAULT_DELIVERY_PREFS.sound,
      desktop:
        user?.notificationPreferences?.desktop ?? DEFAULT_DELIVERY_PREFS.desktop,
    };
  }, [
    user?.notificationPreferences?.desktop,
    user?.notificationPreferences?.message,
    user?.notificationPreferences?.sound,
  ]);

  const socialPreferences = useMemo<SocialPreferences>(() => {
    const socialPrefs = user?.notificationPreferences?.social;
    return {
      muted: socialPrefs?.muted ?? DEFAULT_SOCIAL_PREFS.muted,
      follow: socialPrefs?.follow ?? DEFAULT_SOCIAL_PREFS.follow,
      like: socialPrefs?.like ?? DEFAULT_SOCIAL_PREFS.like,
      comment: socialPrefs?.comment ?? DEFAULT_SOCIAL_PREFS.comment,
      mention: socialPrefs?.mention ?? DEFAULT_SOCIAL_PREFS.mention,
      friendAccepted:
        socialPrefs?.friendAccepted ?? DEFAULT_SOCIAL_PREFS.friendAccepted,
      system: socialPrefs?.system ?? DEFAULT_SOCIAL_PREFS.system,
      mutedUserIds: socialPrefs?.mutedUserIds ?? DEFAULT_SOCIAL_PREFS.mutedUserIds,
      mutedConversationIds:
        socialPrefs?.mutedConversationIds ?? DEFAULT_SOCIAL_PREFS.mutedConversationIds,
      digestEnabled:
        socialPrefs?.digestEnabled ?? DEFAULT_SOCIAL_PREFS.digestEnabled,
      digestWindowHours: normalizeDigestWindow(socialPrefs?.digestWindowHours),
    };
  }, [user?.notificationPreferences?.social]);

  const updatePreferences = useCallback(
    async (payload: NotificationPreferencesUpdatePayload) => {
      if (!user) {
        return false;
      }

      const previousUser = user;
      const nextDelivery = {
        message: payload.message ?? deliveryPreferences.message,
        sound: payload.sound ?? deliveryPreferences.sound,
        desktop: payload.desktop ?? deliveryPreferences.desktop,
      };
      const nextSocial = payload.social
        ? {
            ...socialPreferences,
            ...payload.social,
          }
        : socialPreferences;

      setUser({
        ...user,
        notificationPreferences: {
          message: nextDelivery.message,
          sound: nextDelivery.sound,
          desktop: nextDelivery.desktop,
          social: nextSocial,
        },
      });

      try {
        setSaving(true);
        const response = await userService.updateNotificationPreferences(payload);
        if (response?.user) {
          setUser(response.user);
        }
        return true;
      } catch (error) {
        console.error("Failed to update notification preferences", error);
        setUser(previousUser);
        toast.error("Could not update notification preferences");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [deliveryPreferences, setUser, socialPreferences, user],
  );

  const applyPreset = useCallback(
    async (presetKey: NotificationPresetKey) => {
      const preset = NOTIFICATION_PRESETS[presetKey];
      const previousDelivery = { ...deliveryPreferences };
      const previousSocial = { ...socialPreferences };

      const applied = await updatePreferences({
        message: preset.delivery.message,
        sound: preset.delivery.sound,
        desktop: preset.delivery.desktop,
        social: {
          ...preset.social,
        },
      });

      if (!applied) {
        return;
      }

      toast.success(`${preset.label} preset applied`, {
        action: {
          label: "Undo",
          onClick: () => {
            updatePreferences({
              message: previousDelivery.message,
              sound: previousDelivery.sound,
              desktop: previousDelivery.desktop,
              social: {
                ...previousSocial,
              },
            }).catch((error) => {
              console.error("Failed to undo notification preset", error);
            });
          },
        },
      });
    },
    [deliveryPreferences, socialPreferences, updatePreferences],
  );

  if (!user) {
    return null;
  }

  return (
    <div className={cn("notification-preferences-layout space-y-4", className)}>
      <section className="notification-preferences-section notification-preferences-section--presets space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          Quick presets
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
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
                disabled={saving}
                onClick={() => {
                  applyPreset(presetKey).catch((error) => {
                    console.error("Failed to apply notification preset", error);
                  });
                }}
                className={cn(
                  "notification-preset-chip micro-tap-chip rounded-xl border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-primary/45 bg-primary/10"
                    : "border-border/70 bg-background/80 hover:border-primary/30 hover:bg-muted/30",
                )}
              >
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <preset.Icon className="size-3.5" />
                  {preset.label}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {preset.subtitle}
                </span>
                {active ? (
                  <span className="mt-1.5 inline-flex rounded-full border border-primary/35 bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Active
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="notification-preferences-section notification-preferences-section--delivery space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          Delivery
        </p>

        {[
          {
            key: "message" as const,
            label: "Message notifications",
            hint: "Receive message and activity alerts",
          },
          {
            key: "sound" as const,
            label: "Sound",
            hint: "Play alert sounds for new events",
          },
          {
            key: "desktop" as const,
            label: "Desktop",
            hint: "Show browser notifications",
          },
        ].map((item) => (
          <label
            key={item.key}
            className="notification-preference-row notification-preference-row--delivery flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-2.5 py-2"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-foreground/90">
                {item.label}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {item.hint}
              </span>
            </span>
            <Switch
              checked={deliveryPreferences[item.key]}
              disabled={saving || (!deliveryPreferences.message && item.key !== "message")}
              onCheckedChange={(checked) => {
                updatePreferences({ [item.key]: checked }).catch((error) => {
                  console.error("Failed to update delivery preference", error);
                });
              }}
            />
          </label>
        ))}
      </section>

      <section className="notification-preferences-section notification-preferences-section--social space-y-2.5 rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Social quiet mode
          </p>
          <Switch
            checked={socialPreferences.muted}
            disabled={saving}
            onCheckedChange={(checked) => {
              updatePreferences({ social: { muted: checked } }).catch((error) => {
                console.error("Failed to update quiet mode", error);
              });
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "follow" as const, label: "Follows" },
            { key: "like" as const, label: "Likes" },
            { key: "comment" as const, label: "Comments" },
            { key: "mention" as const, label: "Mentions" },
            { key: "friendAccepted" as const, label: "Friend accepted" },
            { key: "system" as const, label: "System" },
          ].map((item) => (
            <label
              key={item.key}
              className="notification-preference-row notification-preference-row--social flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs"
            >
              <span className="text-foreground/85">{item.label}</span>
              <Switch
                checked={socialPreferences[item.key]}
                disabled={saving || socialPreferences.muted}
                onCheckedChange={(checked) => {
                  updatePreferences({ social: { [item.key]: checked } }).catch((error) => {
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
              disabled={saving || socialPreferences.muted}
              onCheckedChange={(checked) => {
                updatePreferences({ social: { digestEnabled: checked } }).catch((error) => {
                  console.error("Failed to update digest mode", error);
                });
              }}
            />
          </div>

          {socialPreferences.digestEnabled ? (
            <div className="flex flex-wrap gap-1.5">
              {DIGEST_WINDOW_OPTIONS.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    updatePreferences({
                      social: { digestWindowHours: hours },
                    }).catch((error) => {
                      console.error("Failed to update digest window", error);
                    });
                  }}
                  className={cn(
                    "notification-digest-chip micro-tap-chip rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    socialPreferences.digestWindowHours === hours
                      ? "border-primary/45 bg-primary/10 text-primary"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {hours}h
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="notification-preferences-footer flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          className="notification-preferences-reset"
          disabled={saving}
          onClick={() => {
            applyPreset("balanced").catch((error) => {
              console.error("Failed to reset notification preferences", error);
            });
          }}
        >
          Reset to balanced
        </Button>
      </div>
    </div>
  );
};

export default NotificationPreferencesSettings;
