import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import BackToChatCard from "@/components/chat/BackToChatCard";
import NotificationPreferencesSettings from "@/components/notifications/NotificationPreferencesSettings";
import { SidebarProvider } from "@/components/ui/sidebar";

const NotificationSettingsPage = () => {
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <AppSidebar />

      <div className="app-shell-bg notification-settings-page notification-settings-page--command">
        <div className="app-shell-panel notification-settings-shell notification-settings-shell--command p-3 md:p-4">
          <div
            className="notification-settings-frame mx-auto flex w-full max-w-3xl flex-col gap-3"
            aria-label="Notification settings workspace"
          >
            <BackToChatCard onClick={() => navigate("/")} />

            <section
              className="notification-settings-card notification-settings-card--command rounded-2xl border border-border/70 bg-card/80 shadow-sm"
              aria-labelledby="notification-settings-title"
            >
              <header className="notification-settings-card-head border-b border-border/60 px-5 py-4">
                <div className="notification-settings-badge inline-flex items-center gap-2 text-primary">
                  <Bell className="size-4" />
                  <p className="text-xs font-semibold uppercase tracking-wide">
                    Settings
                  </p>
                </div>
                <h1 id="notification-settings-title" className="notification-settings-title mt-2 text-xl font-semibold tracking-tight">
                  Notification Preferences
                </h1>
                <p className="notification-settings-subtitle mt-1 text-sm text-muted-foreground">
                  Manage chat and social alerts with quick presets optimized for mobile.
                </p>
              </header>

              <NotificationPreferencesSettings className="notification-settings-preferences notification-settings-preferences--command p-4 md:p-5" />
            </section>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default NotificationSettingsPage;
