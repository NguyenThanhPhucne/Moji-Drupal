/**
 * SettingsPage — Dedicated settings route page.
 * URL: /settings/:tab
 *
 * Each tab maps to a URL segment:
 *   /settings/account        → My Account
 *   /settings/status         → Custom Status
 *   /settings/appearance     → Appearance
 *   /settings/notifications  → Notifications
 *   /settings/security       → Security
 *   /settings/privacy        → Privacy & Safety
 *   /settings/shortcuts      → Keyboard Shortcuts
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";
import ProfileHero from "@/components/profile/ProfileHero";
import PersonalInfoForm from "@/components/profile/PersonalInfoForm";
import PreferencesForm from "@/components/profile/PreferencesForm";
import PrivacySettings from "@/components/profile/PrivacySettings";
import SecuritySettings from "@/components/profile/SecuritySettings";
import NotificationsSettings from "@/components/profile/NotificationsSettings";
import StatusSettings from "@/components/profile/StatusSettings";
import KeyboardShortcuts from "@/components/profile/KeyboardShortcuts";
import Logout from "@/components/auth/Logout";
import { Input } from "@/components/ui/input";
import {
  User,
  Settings,
  Shield,
  Bell,
  Lock,
  Keyboard,
  Smile,
  Search,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsTab =
  | "account"
  | "status"
  | "appearance"
  | "notifications"
  | "security"
  | "privacy"
  | "shortcuts";

const TAB_TITLES: Record<SettingsTab, string> = {
  account:       "My Account",
  status:        "Custom Status",
  appearance:    "Appearance",
  notifications: "Notifications",
  security:      "Security",
  privacy:       "Privacy & Safety",
  shortcuts:     "Keyboard Shortcuts",
};

const NAV_GROUPS = [
  {
    label: "User Settings",
    items: [
      { id: "account"       as SettingsTab, icon: User,     label: "My Account"          },
      { id: "status"        as SettingsTab, icon: Smile,    label: "Custom Status"        },
      { id: "appearance"    as SettingsTab, icon: Settings, label: "Appearance"           },
      { id: "notifications" as SettingsTab, icon: Bell,     label: "Notifications"        },
    ],
  },
  {
    label: "Security & Privacy",
    items: [
      { id: "security" as SettingsTab, icon: Lock,   label: "Security"         },
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

const ALL_TABS = NAV_GROUPS.flatMap((g) => g.items);
const VALID_TABS = new Set<string>(ALL_TABS.map((t) => t.id));
const DEFAULT_TAB: SettingsTab = "account";

function resolveTab(raw: string | undefined): SettingsTab {
  if (raw && VALID_TABS.has(raw)) return raw as SettingsTab;
  // legacy alias: "preferences" → "appearance"
  if (raw === "preferences") return "appearance";
  return DEFAULT_TAB;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { tab: rawTab } = useParams<{ tab: string }>();
  const navigate        = useNavigate();
  const { user }        = useAuthStore();

  const activeTab = resolveTab(rawTab);
  const [search, setSearch] = useState("");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const normalizedSearch = search.trim().toLowerCase();

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter(
          (item) => !normalizedSearch || item.label.toLowerCase().includes(normalizedSearch),
        ),
      })).filter((g) => g.items.length > 0),
    [normalizedSearch],
  );

  const visibleTabSequence = useMemo(
    () => visibleGroups.flatMap((g) => g.items.map((i) => i.id)),
    [visibleGroups],
  );

  // Navigate to a tab (updates URL)
  const goToTab = (tab: SettingsTab) => {
    navigate(`/settings/${tab}`, { replace: true });
  };

  // ESC → go back
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") navigate(-1);
    };
    globalThis.addEventListener("keydown", handler);
    return () => globalThis.removeEventListener("keydown", handler);
  }, [navigate]);

  // Focus panel heading on tab change
  useEffect(() => {
    requestAnimationFrame(() => panelRef.current?.focus());
  }, [activeTab]);

  const handleNavKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentId: SettingsTab) => {
    const idx = visibleTabSequence.indexOf(currentId);
    if (idx === -1) return;
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (idx + 1) % visibleTabSequence.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (idx - 1 + visibleTabSequence.length) % visibleTabSequence.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = visibleTabSequence.length - 1;
    if (next !== null) {
      e.preventDefault();
      const nextTab = visibleTabSequence[next];
      goToTab(nextTab);
      const tablist = e.currentTarget.closest('[role="tablist"]');
      requestAnimationFrame(() => {
        (tablist?.querySelector<HTMLButtonElement>(`[data-tab="${nextTab}"]`))?.focus();
      });
    }
  };

  return (
    <div className="sp-root">
      {/* ── Sidebar ────────────────────────────────────────── */}
      <aside className="sp-sidebar">
        {/* Profile header */}
        <div className="sp-sidebar-profile">
          <button
            type="button"
            className="sp-back-btn"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeft className="size-4" />
          </button>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="sp-sidebar-avatar"
            />
          ) : (
            <div className="sp-sidebar-avatar sp-sidebar-avatar--fallback">
              {user?.displayName?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="sp-sidebar-identity">
            <p className="sp-sidebar-name">{user?.displayName}</p>
            <p className="sp-sidebar-username">@{user?.username}</p>
          </div>
        </div>

        {/* Search */}
        <div className="sp-search-wrap">
          <Search className="sp-search-icon size-3.5" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search settings…"
            className="sp-search-input"
            aria-label="Search settings sections"
          />
        </div>

        {/* Nav */}
        <nav className="sp-nav" aria-label="Settings navigation">
          {visibleGroups.map((group) => (
            <div key={group.label} role="tablist" aria-label={group.label} className="sp-nav-group">
              <p className="sp-nav-label">{group.label}</p>
              {group.items.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  data-tab={id}
                  aria-selected={activeTab === id}
                  aria-controls={`sp-panel-${id}`}
                  id={`sp-tab-${id}`}
                  tabIndex={activeTab === id ? 0 : -1}
                  onClick={() => goToTab(id)}
                  onKeyDown={(e) => handleNavKeyDown(e, id)}
                  className={cn("sp-nav-item", activeTab === id && "sp-nav-item--active")}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                  {activeTab === id && <ChevronRight className="ml-auto size-3 opacity-40" />}
                </button>
              ))}
            </div>
          ))}

          {visibleGroups.length === 0 && (
            <p className="sp-search-empty">No settings match "{search}"</p>
          )}
        </nav>

        {/* Bottom: Logout */}
        <div className="sp-sidebar-footer">
          <div className="sp-nav-item sp-nav-item--danger">
            <Logout />
          </div>
        </div>
      </aside>

      {/* ── Content ────────────────────────────────────────── */}
      <main className="sp-content" id={`sp-panel-${activeTab}`} role="tabpanel" aria-labelledby={`sp-tab-${activeTab}`}>
        <div className="sp-content-inner">
          {/* Sticky toolbar */}
          <div className="sp-toolbar" aria-label="Current settings section">
            <p className="sp-toolbar-title">
              <span>Settings</span>
                {" "}
              <span className="sp-toolbar-sep" aria-hidden="true">/</span>
                {" "}
              <span className="sp-toolbar-current">{TAB_TITLES[activeTab]}</span>
            </p>
            <span className="sp-toolbar-pill">
              <span className="sp-toolbar-dot" aria-hidden="true">•</span>
              <span>Auto-saved</span>
            </span>
          </div>

          {/* Section heading */}
          <h1
            ref={panelRef}
            className="sp-section-heading"
            tabIndex={-1}
            id={`sp-heading-${activeTab}`}
          >
            {TAB_TITLES[activeTab]}
          </h1>

          {/* ── Panels ── */}
          <div className="sp-panel" key={activeTab}>
            {activeTab === "account" && (
              <>
                <ProfileHero user={user} />
                <PersonalInfoForm userInfo={user} />
              </>
            )}
            {activeTab === "status" && <StatusSettings />}
            {activeTab === "appearance" && <PreferencesForm />}
            {activeTab === "notifications" && <NotificationsSettings />}
            {activeTab === "security" && <SecuritySettings />}
            {activeTab === "privacy" && (
              <PrivacySettings onOpenNotifications={() => goToTab("notifications")} />
            )}
            {activeTab === "shortcuts" && <KeyboardShortcuts />}
          </div>
        </div>
      </main>
    </div>
  );
}
