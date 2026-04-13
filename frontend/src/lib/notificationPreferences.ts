import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal, Sparkles, Target } from "lucide-react";

export type DeliveryPreferences = {
  message: boolean;
  sound: boolean;
  desktop: boolean;
};

export type SocialPreferences = {
  muted: boolean;
  follow: boolean;
  like: boolean;
  comment: boolean;
  friendAccepted: boolean;
  system: boolean;
  mutedUserIds: string[];
  mutedConversationIds: string[];
  digestEnabled: boolean;
  digestWindowHours: number;
};

export type NotificationPresetKey = "focus" | "balanced" | "everything";

export type NotificationPreset = {
  label: string;
  subtitle: string;
  Icon: LucideIcon;
  delivery: DeliveryPreferences;
  social: Pick<
    SocialPreferences,
    | "muted"
    | "follow"
    | "like"
    | "comment"
    | "friendAccepted"
    | "system"
    | "digestEnabled"
    | "digestWindowHours"
  >;
};

export const DIGEST_WINDOW_OPTIONS = [1, 3, 6, 12, 24];

export const DEFAULT_DELIVERY_PREFS: DeliveryPreferences = {
  message: true,
  sound: true,
  desktop: false,
};

export const DEFAULT_SOCIAL_PREFS: SocialPreferences = {
  muted: false,
  follow: true,
  like: true,
  comment: true,
  friendAccepted: true,
  system: true,
  mutedUserIds: [],
  mutedConversationIds: [],
  digestEnabled: false,
  digestWindowHours: 6,
};

export const NOTIFICATION_PRESETS: Record<NotificationPresetKey, NotificationPreset> = {
  focus: {
    label: "Focus",
    subtitle: "Only essentials, less noise",
    Icon: Target,
    delivery: {
      message: true,
      sound: false,
      desktop: false,
    },
    social: {
      muted: true,
      follow: false,
      like: false,
      comment: false,
      friendAccepted: false,
      system: true,
      digestEnabled: true,
      digestWindowHours: 12,
    },
  },
  balanced: {
    label: "Balanced",
    subtitle: "Daily default, smart signal",
    Icon: SlidersHorizontal,
    delivery: {
      message: true,
      sound: true,
      desktop: false,
    },
    social: {
      muted: false,
      follow: true,
      like: true,
      comment: true,
      friendAccepted: true,
      system: true,
      digestEnabled: false,
      digestWindowHours: 6,
    },
  },
  everything: {
    label: "Everything",
    subtitle: "All alerts, real-time",
    Icon: Sparkles,
    delivery: {
      message: true,
      sound: true,
      desktop: true,
    },
    social: {
      muted: false,
      follow: true,
      like: true,
      comment: true,
      friendAccepted: true,
      system: true,
      digestEnabled: false,
      digestWindowHours: 3,
    },
  },
};

export const normalizeDigestWindow = (value: unknown) => {
  const parsed = Number(value || DEFAULT_SOCIAL_PREFS.digestWindowHours);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_SOCIAL_PREFS.digestWindowHours;
  }

  return Math.min(24, Math.max(1, parsed));
};

export const isNotificationPresetActive = (
  presetKey: NotificationPresetKey,
  delivery: DeliveryPreferences,
  social: Pick<
    SocialPreferences,
    | "muted"
    | "follow"
    | "like"
    | "comment"
    | "friendAccepted"
    | "system"
    | "digestEnabled"
    | "digestWindowHours"
  >,
) => {
  const preset = NOTIFICATION_PRESETS[presetKey];

  return (
    delivery.message === preset.delivery.message &&
    delivery.sound === preset.delivery.sound &&
    delivery.desktop === preset.delivery.desktop &&
    social.muted === preset.social.muted &&
    social.follow === preset.social.follow &&
    social.like === preset.social.like &&
    social.comment === preset.social.comment &&
    social.friendAccepted === preset.social.friendAccepted &&
    social.system === preset.social.system &&
    social.digestEnabled === preset.social.digestEnabled &&
    social.digestWindowHours === preset.social.digestWindowHours
  );
};
