import { Button } from "@/components/ui/button";
import { Sun, Moon, Sparkles } from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  DEFAULT_PERSONALIZATION_SNAPSHOT,
  arePersonalizationSnapshotsEqual,
  normalizePersonalizationSnapshot,
  usePersonalizationStore,
  type NotificationDensityPreference,
  type NotificationGroupingPreference,
  type StartPagePreference,
  type SupportedLocale,
  type TimestampStylePreference,
} from "@/stores/usePersonalizationStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/shallow";


const LANGUAGE_OPTIONS: Array<{
  value: SupportedLocale;
  label: string;
  description: string;
}> = [
  { value: "en", label: "English", description: "Default interface" },
  { value: "vi", label: "Vietnamese", description: "Localized labels" },
];

const START_PAGE_OPTIONS: Array<{
  value: StartPagePreference;
  label: string;
  description: string;
}> = [
  { value: "chat", label: "Chat", description: "Open conversations first" },
  { value: "feed", label: "Feed", description: "Start on home feed" },
  { value: "explore", label: "Explore", description: "Discover new posts" },
  { value: "saved", label: "Saved", description: "Jump to bookmarks" },
];

const TIMESTAMP_OPTIONS: Array<{
  value: TimestampStylePreference;
  label: string;
  description: string;
}> = [
  { value: "relative", label: "Relative", description: "2m ago" },
  { value: "absolute", label: "Absolute", description: "Clock time" },
];

const GROUPING_OPTIONS: Array<{
  value: NotificationGroupingPreference;
  label: string;
  description: string;
}> = [
  { value: "auto", label: "Auto", description: "Follow feature flag" },
  { value: "priority", label: "Priority", description: "Important first" },
  { value: "time", label: "Time", description: "Latest first" },
];

const DENSITY_OPTIONS: Array<{
  value: NotificationDensityPreference;
  label: string;
  description: string;
}> = [
  { value: "comfortable", label: "Comfortable", description: "More spacing" },
  { value: "compact", label: "Compact", description: "Tighter layout" },
];

const PreferencesForm = () => {
  const { isDark, toggleTheme } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const {
    locale,
    startPagePreference,
    timestampStylePreference,
    notificationGroupingPreference,
    notificationDensityPreference,
    setLocale,
    setStartPagePreference,
    setTimestampStylePreference,
    setNotificationGroupingPreference,
    setNotificationDensityPreference,
    hydrateFromProfile,
  } = usePersonalizationStore(
    useShallow((state) => ({
      locale: state.locale,
      startPagePreference: state.startPagePreference,
      timestampStylePreference: state.timestampStylePreference,
      notificationGroupingPreference: state.notificationGroupingPreference,
      notificationDensityPreference: state.notificationDensityPreference,
      setLocale: state.setLocale,
      setStartPagePreference: state.setStartPagePreference,
      setTimestampStylePreference: state.setTimestampStylePreference,
      setNotificationGroupingPreference: state.setNotificationGroupingPreference,
      setNotificationDensityPreference: state.setNotificationDensityPreference,
      hydrateFromProfile: state.hydrateFromProfile,
    })),
  );

  const [onlineStatus, setOnlineStatus] = useState(
    user?.showOnlineStatus !== false,
  );
  const [updatingOnlineStatus, setUpdatingOnlineStatus] = useState(false);

  const personalizationSnapshot = useMemo(
    () => ({
      locale,
      startPagePreference,
      timestampStylePreference,
      notificationGroupingPreference,
      notificationDensityPreference,
    }),
    [
      locale,
      notificationDensityPreference,
      notificationGroupingPreference,
      startPagePreference,
      timestampStylePreference,
    ],
  );

  const profileSnapshot = useMemo(
    () => normalizePersonalizationSnapshot(user?.personalizationPreferences),
    [user?.personalizationPreferences],
  );

  const isPersonalizationSynced = arePersonalizationSnapshotsEqual(
    personalizationSnapshot,
    profileSnapshot,
  );
  const isDefaultPersonalization = arePersonalizationSnapshotsEqual(
    personalizationSnapshot,
    DEFAULT_PERSONALIZATION_SNAPSHOT,
  );
  let personalizationStatusLabel = "Saved locally";
  if (user?._id) {
    personalizationStatusLabel = isPersonalizationSynced
      ? "Saved to account"
      : "Syncing changes...";
  }

  useEffect(() => {
    setOnlineStatus(user?.showOnlineStatus !== false);
  }, [user?.showOnlineStatus]);

  const handleOnlineStatusChange = async (checked: boolean) => {
    const previous = onlineStatus;
    setOnlineStatus(checked);

    try {
      setUpdatingOnlineStatus(true);
      const response = await userService.updateOnlineStatusVisibility(checked);

      if (response?.user) {
        setUser(response.user);
      }

      toast.success("Online status preference updated");
    } catch (error) {
      console.error("Failed to update online status preference", error);
      setOnlineStatus(previous);
      toast.error("Could not update online status preference");
    } finally {
      setUpdatingOnlineStatus(false);
    }
  };

  const handleResetPersonalization = () => {
    hydrateFromProfile(DEFAULT_PERSONALIZATION_SNAPSHOT);
    toast.success("Personalization reset to defaults");
  };

  return (
    <div className="space-y-4">
      <Card className="settings-card">
        <CardHeader className="settings-card-header">
          <CardTitle className="settings-card-title flex items-center gap-2">
            <Sun className="h-4.5 w-4.5 text-primary" />
            App preferences
          </CardTitle>
          <CardDescription className="settings-card-desc">Customize your chat experience</CardDescription>
        </CardHeader>

        <CardContent className="settings-card-body p-0">
          <div className="settings-toggle-row">
            <div>
              <Label htmlFor="theme-toggle" className="text-sm font-medium">
                Dark mode
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Switch between light and dark appearance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-muted-foreground" />
              <Switch
                id="theme-toggle"
                checked={isDark}
                onCheckedChange={toggleTheme}
                className="data-[state=checked]:bg-primary-glow"
              />
              <Moon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          <div className="settings-toggle-row">
            <div>
              <Label htmlFor="online-status" className="text-sm font-medium">
                Show online status
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Allow others to see when you are online
              </p>
            </div>
            <Switch
              id="online-status"
              checked={onlineStatus}
              onCheckedChange={handleOnlineStatusChange}
              disabled={updatingOnlineStatus}
              className="data-[state=checked]:bg-primary-glow"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="settings-card">
        <CardHeader className="settings-card-header">
          <CardTitle className="settings-card-title flex items-center gap-2">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            Experience personalization
          </CardTitle>
          <CardDescription className="settings-card-desc">
            Tune language, default start page, and notification experience.
          </CardDescription>
          <div
            className={cn(
              "settings-card-desc settings-save-indicator",
              !isPersonalizationSynced && "text-primary",
            )}
            role="status"
            aria-live="polite"
          >
            <span
              className={cn(
                "settings-save-dot",
                isPersonalizationSynced
                  ? "settings-save-dot--idle"
                  : "settings-save-dot--saving",
              )}
              aria-hidden="true"
            />
            {personalizationStatusLabel}
          </div>
        </CardHeader>

        <CardContent className="settings-card-body p-0">
          <div className="settings-option-section">
            <div className="settings-option-header">
              <p className="settings-option-title">Language</p>
              <p className="settings-option-desc">Choose your primary interface language.</p>
            </div>
            <div className="settings-option-grid" role="radiogroup" aria-label="Language">
              {LANGUAGE_OPTIONS.map((option) => {
                const active = locale === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLocale(option.value)}
                    className={cn(
                      "settings-option-chip micro-tap-chip",
                      active && "settings-option-chip--active",
                    )}
                  >
                    <span className="settings-option-chip-title">{option.label}</span>
                    <span className="settings-option-chip-desc">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-option-section">
            <div className="settings-option-header">
              <p className="settings-option-title">Start page</p>
              <p className="settings-option-desc">Pick the first screen you want to land on.</p>
            </div>
            <div className="settings-option-grid" role="radiogroup" aria-label="Start page">
              {START_PAGE_OPTIONS.map((option) => {
                const active = startPagePreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStartPagePreference(option.value)}
                    className={cn(
                      "settings-option-chip micro-tap-chip",
                      active && "settings-option-chip--active",
                    )}
                  >
                    <span className="settings-option-chip-title">{option.label}</span>
                    <span className="settings-option-chip-desc">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-option-section">
            <div className="settings-option-header">
              <p className="settings-option-title">Notification timestamps</p>
              <p className="settings-option-desc">Adjust how timestamps appear in alerts.</p>
            </div>
            <div className="settings-option-grid" role="radiogroup" aria-label="Notification timestamps">
              {TIMESTAMP_OPTIONS.map((option) => {
                const active = timestampStylePreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTimestampStylePreference(option.value)}
                    className={cn(
                      "settings-option-chip micro-tap-chip",
                      active && "settings-option-chip--active",
                    )}
                  >
                    <span className="settings-option-chip-title">{option.label}</span>
                    <span className="settings-option-chip-desc">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-option-section">
            <div className="settings-option-header">
              <p className="settings-option-title">Notification grouping</p>
              <p className="settings-option-desc">Control how alerts are bundled together.</p>
            </div>
            <div className="settings-option-grid" role="radiogroup" aria-label="Notification grouping">
              {GROUPING_OPTIONS.map((option) => {
                const active = notificationGroupingPreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setNotificationGroupingPreference(option.value)}
                    className={cn(
                      "settings-option-chip micro-tap-chip",
                      active && "settings-option-chip--active",
                    )}
                  >
                    <span className="settings-option-chip-title">{option.label}</span>
                    <span className="settings-option-chip-desc">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-option-section">
            <div className="settings-option-header">
              <p className="settings-option-title">Notification density</p>
              <p className="settings-option-desc">Choose how compact notifications should be.</p>
            </div>
            <div className="settings-option-grid" role="radiogroup" aria-label="Notification density">
              {DENSITY_OPTIONS.map((option) => {
                const active = notificationDensityPreference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setNotificationDensityPreference(option.value)}
                    className={cn(
                      "settings-option-chip micro-tap-chip",
                      active && "settings-option-chip--active",
                    )}
                  >
                    <span className="settings-option-chip-title">{option.label}</span>
                    <span className="settings-option-chip-desc">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-option-footer">
            <Button
              type="button"
              variant="outline"
              disabled={isDefaultPersonalization}
              onClick={handleResetPersonalization}
            >
              Reset to defaults
            </Button>
            <span className="text-[11px] text-muted-foreground">Syncs across devices</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PreferencesForm;
