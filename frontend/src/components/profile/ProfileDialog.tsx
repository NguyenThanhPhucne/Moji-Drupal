import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
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
import {
  User,
  Settings,
  Shield,
  Bell,
  ChevronRight,
} from "lucide-react";
import Logout from "../auth/Logout";

type SettingsTab = "account" | "preferences" | "notifications" | "privacy";

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

interface ProfileDialogProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const ProfileDialog = ({ open, setOpen }: ProfileDialogProps) => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");

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
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="settings-nav-group">
                  <p className="settings-nav-label">{group.label}</p>
                  {group.items.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={cn(
                        "settings-nav-item",
                        activeTab === id && "settings-nav-item--active",
                      )}
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
              {activeTab === "account" && (
                <>
                  <ProfileHero user={user} />
                  <div className="settings-section">
                    <PersonalInfoForm userInfo={user} />
                  </div>
                </>
              )}
              {activeTab === "preferences" && (
                <div className="settings-section">
                  <h2 className="settings-section-title">Appearance</h2>
                  <PreferencesForm />
                </div>
              )}
              {activeTab === "notifications" && (
                <div className="settings-section">
                  <h2 className="settings-section-title">Notifications</h2>
                  <NotificationsSection />
                </div>
              )}
              {activeTab === "privacy" && (
                <div className="settings-section">
                  <h2 className="settings-section-title">Privacy & Safety</h2>
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
  const [msg, setMsg] = useState(true);
  const [sound, setSound] = useState(true);
  const [desktop, setDesktop] = useState(false);

  const rows = [
    { id: "notif-msg",     label: "Message notifications",  sub: "Get notified when you receive new messages", val: msg,     set: setMsg },
    { id: "notif-sound",   label: "Notification sounds",    sub: "Play a sound when messages arrive",          val: sound,   set: setSound },
    { id: "notif-desktop", label: "Desktop notifications",  sub: "Show native desktop push notifications",     val: desktop, set: setDesktop },
  ];

  return (
    <div className="settings-card">
      {rows.map(({ id, label, sub, val, set }) => (
        <div key={id} className="settings-toggle-row">
          <div>
            <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          </div>
          <Switch id={id} checked={val} onCheckedChange={set}
            className="data-[state=checked]:bg-primary shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default ProfileDialog;
