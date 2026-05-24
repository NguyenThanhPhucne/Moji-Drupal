import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import ProfileHero from "./ProfileHero";
import PersonalInfoForm from "./PersonalInfoForm";
import PreferencesForm from "./PreferencesForm";
import PrivacySettings from "./PrivacySettings";
import SecuritySettings from "./SecuritySettings";
import NotificationsSettings from "./NotificationsSettings";
import StatusSettings from "./StatusSettings";
import KeyboardShortcuts from "./KeyboardShortcuts";
import {
  User,
  Settings,
  Shield,
  Bell,
  Lock,
  Keyboard,
  Smile,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import Logout from "../auth/Logout";
import { Input } from "../ui/input";

type SettingsTab =
  | "account"
  | "status"
  | "preferences"
  | "notifications"
  | "security"
  | "privacy"
  | "shortcuts";

const TAB_TITLES: Record<SettingsTab, string> = {
  account:       "My Account",
  status:        "Custom Status",
  preferences:   "Appearance",
  notifications: "Notifications",
  security:      "Security",
  privacy:       "Privacy & Safety",
  shortcuts:     "Keyboard Shortcuts",
};

const NAV_GROUPS = [
  {
    label: "User Settings",
    items: [
      { id: "account"       as SettingsTab, icon: User,     label: "My Account"     },
      { id: "status"        as SettingsTab, icon: Smile,    label: "Custom Status"  },
      { id: "preferences"   as SettingsTab, icon: Settings, label: "Appearance"     },
      { id: "notifications" as SettingsTab, icon: Bell,     label: "Notifications"  },
    ],
  },
  {
    label: "Security & Privacy",
    items: [
      { id: "security" as SettingsTab, icon: Lock,   label: "Security"       },
      { id: "privacy"  as SettingsTab, icon: Shield, label: "Privacy & Safety" },
    ],
  },
  {
    label: "App",
    items: [
      { id: "shortcuts" as SettingsTab, icon: Keyboard, label: "Keyboard Shortcuts" },
    ],
  },
];

const NAV_ITEMS    = NAV_GROUPS.flatMap((g) => g.items);
const TAB_SEQUENCE = NAV_ITEMS.map((item) => item.id);

interface ProfileDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const ProfileDialog = ({ open, setOpen }: ProfileDialogProps) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab]         = useState<SettingsTab>("account");
  const [settingsSearch, setSettingsSearch] = useState("");
  const panelHeadingRefs = useRef<Record<SettingsTab, HTMLHeadingElement | null>>({
    account: null, status: null, preferences: null,
    notifications: null, security: null, privacy: null, shortcuts: null,
  });
  const shouldFocusPanelHeading = useRef(false);

  const normalizedSearch = settingsSearch.trim().toLowerCase();
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !normalizedSearch || item.label.toLowerCase().includes(normalizedSearch),
    ),
  })).filter((g) => g.items.length > 0);

  const visibleTabSequence = useMemo(
    () => visibleGroups.flatMap((g) => g.items.map((item) => item.id)),
    [visibleGroups],
  );

  useEffect(() => {
    if (!visibleTabSequence.includes(activeTab)) {
      setActiveTab(visibleTabSequence[0] ?? TAB_SEQUENCE[0]);
    }
  }, [activeTab, visibleTabSequence]);

  useEffect(() => {
    if (!open || !shouldFocusPanelHeading.current) return;
    shouldFocusPanelHeading.current = false;
    requestAnimationFrame(() => { panelHeadingRefs.current[activeTab]?.focus(); });
  }, [activeTab, open]);

  const activateTab = (tab: SettingsTab, moveFocusToPanel = false) => {
    if (moveFocusToPanel) shouldFocusPanelHeading.current = true;
    setActiveTab(tab);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    tabOrder: SettingsTab[],
  ) => {
    const currentTab  = event.currentTarget.dataset.settingsTab as SettingsTab;
    const currentIndex = tabOrder.indexOf(currentTab);
    if (currentIndex === -1 || tabOrder.length === 0) return;

    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")      nextIndex = (currentIndex + 1) % tabOrder.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")    nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
    else if (event.key === "Home")                                     nextIndex = 0;
    else if (event.key === "End")                                      nextIndex = tabOrder.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateTab(currentTab, true);
      return;
    } else return;

    event.preventDefault();
    const nextTab = tabOrder[nextIndex];
    activateTab(nextTab, true);
    const tablist = event.currentTarget.closest('[role="tablist"]');
    requestAnimationFrame(() => {
      (tablist?.querySelector<HTMLButtonElement>(`[data-settings-tab="${nextTab}"]`))?.focus();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="settings-modal-root" contentClassMode="fullscreen" showCloseButton={false}>
        <DialogTitle className="sr-only">User Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your account, status, appearance, notifications, security, and privacy settings.
        </DialogDescription>

        <div className="settings-layout">
          {/* ── Sidebar ── */}
          <aside className="settings-sidebar">
            {/* User profile header */}
            <div className="settings-sidebar-profile">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.displayName} className="settings-sidebar-profile-avatar" />
              ) : (
                <div className="settings-sidebar-profile-avatar">
                  {user?.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="settings-sidebar-profile-info">
                <p className="settings-sidebar-profile-name">{user?.displayName}</p>
                <p className="settings-sidebar-profile-username">@{user?.username}</p>
              </div>
              <button
                type="button"
                className="settings-sidebar-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close settings"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="settings-sidebar-inner">
              <p id="settings-tabs-help" className="sr-only">
                Use arrow keys to move through settings tabs. Press Enter or Space to open a tab.
              </p>

              <div className="settings-search-shell">
                <Search className="settings-search-icon size-3.5" />
                <Input
                  value={settingsSearch}
                  onChange={(e) => setSettingsSearch(e.target.value)}
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
                  <p className="settings-nav-label">{group.label}</p>
                  {group.items.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => activateTab(id)}
                      onKeyDown={(e) => handleTabKeyDown(e, visibleTabSequence)}
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

              {/* Logout */}
              <div className="settings-nav-group settings-nav-group--danger">
                <div className="settings-nav-item settings-nav-item--danger">
                  <Logout />
                </div>
              </div>
            </div>
          </aside>

          {/* ── Content ── */}
          <main className="settings-content">
            <div className="settings-content-inner">
              <div className="settings-toolbar">
                <div className="flex items-center gap-2">
                  <p className="settings-toolbar-title">
                    Settings
                    <span className="mx-1.5 text-muted-foreground/50">/</span>
                    <span className="text-muted-foreground font-normal">{TAB_TITLES[activeTab]}</span>
                  </p>
                </div>
                <span className="settings-toolbar-pill">Auto-saved</span>
              </div>

              {/* Mobile tab strip */}
              <div className="settings-mobile-tabs" role="tablist" aria-label="Settings tabs" aria-describedby="settings-tabs-help">
                {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => activateTab(id)}
                    onKeyDown={(e) => handleTabKeyDown(e, TAB_SEQUENCE)}
                    className={cn("settings-mobile-tab", activeTab === id && "settings-mobile-tab--active")}
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

              {/* ── Account ── */}
              {activeTab === "account" && (
                <div className="settings-panel" id="settings-panel-account" role="tabpanel"
                  aria-labelledby="settings-tab-account settings-mobile-tab-account">
                  <h2 ref={(el) => { panelHeadingRefs.current.account = el; }}
                    className="settings-section-title" tabIndex={-1}>My Account</h2>
                  <ProfileHero user={user} />
                  <div className="settings-section">
                    <PersonalInfoForm userInfo={user} />
                  </div>
                </div>
              )}

              {/* ── Status ── */}
              {activeTab === "status" && (
                <div className="settings-panel" id="settings-panel-status" role="tabpanel"
                  aria-labelledby="settings-tab-status settings-mobile-tab-status">
                  <h2 ref={(el) => { panelHeadingRefs.current.status = el; }}
                    className="settings-section-title" tabIndex={-1}>Custom Status</h2>
                  <StatusSettings />
                </div>
              )}

              {/* ── Appearance ── */}
              {activeTab === "preferences" && (
                <div className="settings-section settings-panel" id="settings-panel-preferences" role="tabpanel"
                  aria-labelledby="settings-tab-preferences settings-mobile-tab-preferences">
                  <h2 ref={(el) => { panelHeadingRefs.current.preferences = el; }}
                    className="settings-section-title" tabIndex={-1}>Appearance</h2>
                  <PreferencesForm />
                </div>
              )}

              {/* ── Notifications ── */}
              {activeTab === "notifications" && (
                <div className="settings-section settings-panel" id="settings-panel-notifications" role="tabpanel"
                  aria-labelledby="settings-tab-notifications settings-mobile-tab-notifications">
                  <h2 ref={(el) => { panelHeadingRefs.current.notifications = el; }}
                    className="settings-section-title" tabIndex={-1}>Notifications</h2>
                  <NotificationsSettings />
                </div>
              )}

              {/* ── Security ── */}
              {activeTab === "security" && (
                <div className="settings-section settings-panel" id="settings-panel-security" role="tabpanel"
                  aria-labelledby="settings-tab-security settings-mobile-tab-security">
                  <h2 ref={(el) => { panelHeadingRefs.current.security = el; }}
                    className="settings-section-title" tabIndex={-1}>Security</h2>
                  <SecuritySettings />
                </div>
              )}

              {/* ── Privacy ── */}
              {activeTab === "privacy" && (
                <div className="settings-section settings-panel" id="settings-panel-privacy" role="tabpanel"
                  aria-labelledby="settings-tab-privacy settings-mobile-tab-privacy">
                  <h2 ref={(el) => { panelHeadingRefs.current.privacy = el; }}
                    className="settings-section-title" tabIndex={-1}>Privacy &amp; Safety</h2>
                  <PrivacySettings onOpenNotifications={() => activateTab("notifications", true)} />
                </div>
              )}

              {/* ── Keyboard Shortcuts ── */}
              {activeTab === "shortcuts" && (
                <div className="settings-section settings-panel" id="settings-panel-shortcuts" role="tabpanel"
                  aria-labelledby="settings-tab-shortcuts settings-mobile-tab-shortcuts">
                  <h2 ref={(el) => { panelHeadingRefs.current.shortcuts = el; }}
                    className="settings-section-title" tabIndex={-1}>Keyboard Shortcuts</h2>
                  <KeyboardShortcuts />
                </div>
              )}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileDialog;
