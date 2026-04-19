import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { userService } from "@/services/userService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ProfileHero from "./ProfileHero";
import PersonalInfoForm from "./PersonalInfoForm";
import PreferencesForm from "./PreferencesForm";
import PrivacySettings from "./PrivacySettings";
import {
  User,
  Settings,
  Shield,
  Bell,
  ChevronRight,
  Search,
} from "lucide-react";
import Logout from "../auth/Logout";
import { Input } from "../ui/input";

type SettingsTab = "account" | "preferences" | "notifications" | "privacy";

const TAB_TITLES: Record<SettingsTab, string> = {
  account: "My Account",
  preferences: "Appearance",
  notifications: "Notifications",
  privacy: "Privacy & Safety",
};

const NAV_GROUPS = [
  {
    label: "User Settings",
    items: [
      { id: "account" as SettingsTab, icon: User, label: "My Account" },
      { id: "preferences" as SettingsTab, icon: Settings, label: "Appearance" },
      { id: "notifications" as SettingsTab, icon: Bell, label: "Notifications" },
      { id: "privacy" as SettingsTab, icon: Shield, label: "Privacy & Safety" },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const TAB_SEQUENCE = NAV_ITEMS.map((item) => item.id);

interface ProfileDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const ProfileDialog = ({ open, setOpen }: ProfileDialogProps) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [settingsSearch, setSettingsSearch] = useState("");
  const panelHeadingRefs = useRef<Record<SettingsTab, HTMLHeadingElement | null>>({
    account: null,
    preferences: null,
    notifications: null,
    privacy: null,
  });
  const shouldFocusPanelHeading = useRef(false);

  const normalizedSearch = settingsSearch.trim().toLowerCase();
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      !normalizedSearch ||
      item.label.toLowerCase().includes(normalizedSearch),
    ),
  })).filter((group) => group.items.length > 0);

  const visibleTabSequence = useMemo(
    () => visibleGroups.flatMap((group) => group.items.map((item) => item.id)),
    [visibleGroups],
  );

  useEffect(() => {
    if (!visibleTabSequence.includes(activeTab)) {
      setActiveTab(visibleTabSequence[0] ?? TAB_SEQUENCE[0]);
    }
  }, [activeTab, visibleTabSequence]);

  useEffect(() => {
    if (!open || !shouldFocusPanelHeading.current) {
      return;
    }

    shouldFocusPanelHeading.current = false;
    requestAnimationFrame(() => {
      panelHeadingRefs.current[activeTab]?.focus();
    });
  }, [activeTab, open]);

  const activateTab = (tab: SettingsTab, moveFocusToPanel = false) => {
    if (moveFocusToPanel) {
      shouldFocusPanelHeading.current = true;
    }
    setActiveTab(tab);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tabOrder: SettingsTab[],
  ) => {
    const currentTab = event.currentTarget.dataset.settingsTab as SettingsTab;
    const currentIndex = tabOrder.indexOf(currentTab);
    if (currentIndex === -1 || tabOrder.length === 0) {
      return;
    }

    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabOrder.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabOrder.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateTab(currentTab, true);
      return;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabOrder[nextIndex];
    activateTab(nextTab, true);

    const tablist = event.currentTarget.closest('[role="tablist"]');
    requestAnimationFrame(() => {
      const nextButton = tablist?.querySelector<HTMLButtonElement>(
        `[data-settings-tab="${nextTab}"]`,
      );
      nextButton?.focus();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="settings-modal-root">
        <DialogTitle className="sr-only">User Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your account, appearance, notifications, and privacy settings.
        </DialogDescription>

        <div className="settings-layout">
          {/* ── Sidebar ─────────────────────── */}
          <aside className="settings-sidebar">
            <div className="settings-sidebar-inner">
              <p id="settings-tabs-help" className="sr-only">
                Use arrow keys to move through settings tabs. Press Enter or
                Space to open a tab and move focus to its section.
              </p>

              <div className="settings-search-shell">
                <Search className="settings-search-icon size-3.5" />
                <Input
                  value={settingsSearch}
                  onChange={(event) => setSettingsSearch(event.target.value)}
                  placeholder="Search settings"
                  className="settings-search-input"
                  aria-label="Search settings sections"
                />
              </div>

              {visibleGroups.map((group) => (
                <div
                  key={group.label}
                  className="settings-nav-group"
                  role="tablist"
                  aria-label={group.label}
                  aria-describedby="settings-tabs-help"
                >
                  <p className="settings-nav-label">
                    {group.label}
                  </p>
                  {group.items.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => activateTab(id)}
                      onKeyDown={(event) =>
                        handleTabKeyDown(event, visibleTabSequence)
                      }
                      className={cn(
                        "settings-nav-item",
                        activeTab === id && "settings-nav-item--active",
                      )}
                      id={`settings-tab-${id}`}
                      role="tab"
                      data-settings-tab={id}
                      aria-selected={activeTab === id}
                      aria-controls={`settings-panel-${id}`}
                      aria-describedby="settings-tabs-help"
                      tabIndex={activeTab === id ? 0 : -1}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{label}</span>
                      {activeTab === id && (
                        <ChevronRight className="ml-auto size-3.5 opacity-50" />
                      )}
                    </button>
                  ))}
                </div>
              ))}

              {visibleGroups.length === 0 && (
                <div className="settings-search-empty">
                  No settings match this search.
                </div>
              )}

              {/* Danger / Logout */}
              <div className="settings-nav-group settings-nav-group--danger">
                <div className="settings-nav-item settings-nav-item--danger">
                  <Logout />
                </div>
              </div>
            </div>
          </aside>

          {/* ── Content ─────────────────────── */}
          <main className="settings-content">
            <div className="settings-content-inner">
              <div className="settings-toolbar">
                <div>
                  <p className="settings-toolbar-eyebrow">Workspace</p>
                  <p className="settings-toolbar-title">User Settings</p>
                  <p className="settings-toolbar-subtitle">
                    {TAB_TITLES[activeTab]}
                  </p>
                </div>
                <span className="settings-toolbar-pill">Auto-saved</span>
              </div>

              <div
                className="settings-mobile-tabs"
                role="tablist"
                aria-label="Settings tabs"
                aria-describedby="settings-tabs-help"
              >
                {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => activateTab(id)}
                    onKeyDown={(event) => handleTabKeyDown(event, TAB_SEQUENCE)}
                    className={cn(
                      "settings-mobile-tab",
                      activeTab === id && "settings-mobile-tab--active",
                    )}
                    id={`settings-mobile-tab-${id}`}
                    role="tab"
                    data-settings-tab={id}
                    aria-selected={activeTab === id}
                    aria-controls={`settings-panel-${id}`}
                    aria-describedby="settings-tabs-help"
                    tabIndex={activeTab === id ? 0 : -1}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {activeTab === "account" && (
                <div
                  className="settings-panel"
                  id="settings-panel-account"
                  role="tabpanel"
                  aria-labelledby="settings-tab-account settings-mobile-tab-account"
                  aria-describedby="settings-panel-desc-account"
                >
                  <h2
                    ref={(element) => {
                      panelHeadingRefs.current.account = element;
                    }}
                    className="settings-section-title"
                    tabIndex={-1}
                  >
                    My Account
                  </h2>
                  <p id="settings-panel-desc-account" className="sr-only">
                    Manage your profile details and personal information.
                  </p>
                  <ProfileHero user={user} />
                  <div className="settings-section">
                    <PersonalInfoForm userInfo={user} />
                  </div>
                </div>
              )}
              {activeTab === "preferences" && (
                <div
                  className="settings-section settings-panel"
                  id="settings-panel-preferences"
                  role="tabpanel"
                  aria-labelledby="settings-tab-preferences settings-mobile-tab-preferences"
                  aria-describedby="settings-panel-desc-preferences"
                >
                  <h2
                    ref={(element) => {
                      panelHeadingRefs.current.preferences = element;
                    }}
                    className="settings-section-title"
                    tabIndex={-1}
                  >
                    Appearance
                  </h2>
                  <p id="settings-panel-desc-preferences" className="sr-only">
                    Configure theme and visual presentation preferences.
                  </p>
                  <PreferencesForm />
                </div>
              )}
              {activeTab === "notifications" && (
                <div
                  className="settings-section settings-panel"
                  id="settings-panel-notifications"
                  role="tabpanel"
                  aria-labelledby="settings-tab-notifications settings-mobile-tab-notifications"
                  aria-describedby="settings-panel-desc-notifications"
                >
                  <h2
                    ref={(element) => {
                      panelHeadingRefs.current.notifications = element;
                    }}
                    className="settings-section-title"
                    tabIndex={-1}
                  >
                    Notifications
                  </h2>
                  <p id="settings-panel-desc-notifications" className="sr-only">
                    Control message, sound, and desktop notification behavior.
                  </p>
                  <NotificationsSection />
                </div>
              )}
              {activeTab === "privacy" && (
                <div
                  className="settings-section settings-panel"
                  id="settings-panel-privacy"
                  role="tabpanel"
                  aria-labelledby="settings-tab-privacy settings-mobile-tab-privacy"
                  aria-describedby="settings-panel-desc-privacy"
                >
                  <h2
                    ref={(element) => {
                      panelHeadingRefs.current.privacy = element;
                    }}
                    className="settings-section-title"
                    tabIndex={-1}
                  >
                    Privacy & Safety
                  </h2>
                  <p id="settings-panel-desc-privacy" className="sr-only">
                    Review account protection and safety related settings.
                  </p>
                  <PrivacySettings />
                </div>
              )}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Placeholder Notifications section ─────────────────────────────────── */
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";

function NotificationsSection() {
  const { user, setUser } = useAuthStore();
  const prefs = user?.notificationPreferences ?? {
    message: true,
    sound: true,
    desktop: false,
  };

  const [savingKey, setSavingKey] = useState<"message" | "sound" | "desktop" | null>(null);

  const updatePreference = async (key: "message" | "sound" | "desktop", value: boolean) => {
    if (!user) {
      return;
    }

    const previousPrefs = prefs;
    const nextPrefs = {
      ...previousPrefs,
      [key]: value,
    };

    setUser({
      ...user,
      notificationPreferences: nextPrefs,
    });

    try {
      setSavingKey(key);
      const response = await userService.updateNotificationPreferences(nextPrefs);
      if (response?.user) {
        setUser(response.user);
      }
    } catch (error) {
      console.error("Failed to update notification preferences", error);
      setUser({
        ...user,
        notificationPreferences: previousPrefs,
      });
      toast.error("Could not update notification preferences");
    } finally {
      setSavingKey(null);
    }
  };

  const rows = [
    { id: "notif-msg", key: "message" as const, label: "Message notifications", sub: "Get notified when you receive new messages", val: prefs.message },
    { id: "notif-sound", key: "sound" as const, label: "Notification sounds", sub: "Play a sound when messages arrive", val: prefs.sound },
    { id: "notif-desktop", key: "desktop" as const, label: "Desktop notifications", sub: "Show native desktop push notifications", val: prefs.desktop },
  ];

  return (
    <div
      className="settings-card"
      aria-busy={savingKey !== null}
      aria-live="polite"
      aria-label="Notification controls"
    >
      <div className="settings-card-header">
        <h3 className="settings-card-title">Notification Controls</h3>
        <p className="settings-card-desc settings-save-indicator" role="status" aria-live="polite">
          <span
            className={cn(
              "settings-save-dot",
              savingKey ? "settings-save-dot--saving" : "settings-save-dot--idle",
            )}
            aria-hidden="true"
          />
          {savingKey
            ? "Saving preferences..."
            : "Changes are saved instantly to your account."}
        </p>
      </div>
      <div className="settings-card-body">
      {rows.map(({ id, key, label, sub, val }) => (
        <div key={id} className="settings-toggle-row">
          <div>
            <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
            <p id={`${id}-hint`} className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
          <Switch id={id} checked={val} disabled={savingKey === key} aria-describedby={`${id}-hint`} onCheckedChange={(checked) => updatePreference(key, checked)}
            className="data-[state=checked]:bg-primary shrink-0 transition-colors duration-200" />
        </div>
      ))}
      </div>
    </div>
  );
}

export default ProfileDialog;
