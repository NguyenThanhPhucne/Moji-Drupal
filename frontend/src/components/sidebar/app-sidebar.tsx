import { NavUser } from "@/components/sidebar/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Bookmark,
  Compass,
  Home,
  MessageSquare,
  Palette,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import CreateNewChat from "../chat/CreateNewChat";
import NewGroupChatModal from "../chat/NewGroupChatModal";
import GroupChatList from "../chat/GroupChatList";
import AddFriendModal from "../chat/AddFriendModal";
import DirectMessageList from "../chat/DirectMessageList";
import FriendsManagerDialog from "../chat/FriendsManagerDialog";
import AppearanceDrawer from "../chat/AppearanceDrawer";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import ConversationSkeleton from "../skeleton/ConversationSkeleton";
import { useChatStore } from "@/stores/useChatStore";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { sidebarLayout } = useThemeStore();
  const { user } = useAuthStore();
  const { unreadSocialCount } = useNotificationStore();
  const { convoLoading } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isCompact = sidebarLayout === "compact";

  const quickNavItems: Array<{
    key: string;
    label: string;
    icon: LucideIcon;
    to: string;
    isActive: boolean;
    badge?: number;
    wide?: boolean;
  }> = [
    {
      key: "feed",
      label: "Feed",
      icon: Home,
      to: "/feed",
      isActive: location.pathname === "/feed",
      badge: unreadSocialCount,
    },
    {
      key: "explore",
      label: "Explore",
      icon: Compass,
      to: "/explore",
      isActive: location.pathname === "/explore",
    },
    {
      key: "chats",
      label: "Chats",
      icon: MessageSquare,
      to: "/",
      isActive: location.pathname === "/",
    },
    {
      key: "saved",
      label: "Saved",
      icon: Bookmark,
      to: "/saved",
      isActive: location.pathname === "/saved",
    },
    {
      key: "profile",
      label: "Profile",
      icon: User,
      to: user?._id ? `/profile/${user._id}` : "/profile",
      isActive: location.pathname.startsWith("/profile"),
      wide: true,
    },
  ];

  const railItems: Array<{
    key: string;
    icon: LucideIcon;
    to: string;
    title: string;
    isActive: boolean;
  }> = [
    {
      key: "rail-chats",
      icon: MessageSquare,
      to: "/",
      title: "Chats",
      isActive: location.pathname === "/",
    },
    {
      key: "rail-feed",
      icon: Home,
      to: "/feed",
      title: "Feed",
      isActive: location.pathname === "/feed",
    },
    {
      key: "rail-explore",
      icon: Compass,
      to: "/explore",
      title: "Explore",
      isActive: location.pathname === "/explore",
    },
    {
      key: "rail-saved",
      icon: Bookmark,
      to: "/saved",
      title: "Saved",
      isActive: location.pathname === "/saved",
    },
    {
      key: "rail-profile",
      icon: User,
      to: user?._id ? `/profile/${user._id}` : "/profile",
      title: "Profile",
      isActive: location.pathname.startsWith("/profile"),
    },
  ];

  return (
    <>
      <Sidebar
        data-chat-sidebar="true"
        variant="inset"
        className={cn(
          "border-r border-border/60 bg-sidebar/90 backdrop-blur-xl transition-[width] duration-300",
          isCompact && "w-[72px] min-w-[72px] max-w-[72px]"
        )}
        {...props}
      >
        {/* Header */}
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className={cn(
                "flex w-full items-center justify-between rounded-2xl bg-gradient-primary px-3 py-2.5 shadow-soft",
                isCompact && "px-2 justify-center"
              )}>
                {!isCompact && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                      Workspace
                    </p>
                    <h1 className="text-base font-bold text-white tracking-[0.02em]">
                      Coming
                    </h1>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-white/80">
                        Realtime Messaging
                      </p>
                      {unreadSocialCount > 0 && (
                        <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {unreadSocialCount > 99 ? "99+" : unreadSocialCount}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Appearance button — replaces old Sun/Moon switch */}
                <button
                  type="button"
                  data-keep-chat-open="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrawerOpen(true);
                  }}
                  title="Appearance"
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2 py-1.5",
                    "text-white/80 hover:bg-white/25 hover:text-white transition-colors",
                    isCompact && "size-9 p-0 justify-center rounded-xl"
                  )}
                >
                  <Palette className="size-3.5" />
                  {!isCompact && <span className="text-[11px] font-medium">Theme</span>}
                </button>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        {/* Content */}
        <SidebarContent className="beautiful-scrollbar px-1">
          <SidebarGroup>
            <SidebarGroupContent>
              {isCompact ? (
                /* ── Compact rail: vertical icon list ───────────────────── */
                <div className="flex flex-col items-center gap-1.5 py-1">
                  {railItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        title={item.title}
                        onClick={() => navigate(item.to)}
                        className={cn(
                          "relative flex size-10 items-center justify-center rounded-xl border transition-all duration-200",
                          item.isActive
                            ? "nav-rail-active border-primary/60 bg-primary text-primary-foreground"
                            : "border-border/50 bg-muted/40 text-foreground/80 hover:bg-muted/75"
                        )}
                      >
                        {item.isActive && (
                          <span className="absolute -left-2 h-4 w-1 rounded-full bg-primary" />
                        )}
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* ── Full rail: horizontal + quick nav grid ─────────────── */
                <>
                  <div className="mb-2 flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 p-2">
                    {railItems.slice(0, 3).map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          title={item.title}
                          onClick={() => navigate(item.to)}
                          className={cn(
                            "relative inline-flex size-9 items-center justify-center rounded-xl border transition-all duration-200",
                            item.isActive
                              ? "nav-rail-active border-primary/60 bg-primary text-primary-foreground"
                              : "border-border/50 bg-muted/40 text-foreground/80 hover:bg-muted/75"
                          )}
                        >
                          {item.isActive && (
                            <span className="absolute -left-1.5 h-4 w-1 rounded-full bg-primary" />
                          )}
                          <Icon className="size-4" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-2">
                    {quickNavItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => navigate(item.to)}
                          className={cn(
                            "inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all",
                            item.isActive
                              ? "bg-primary text-primary-foreground shadow-soft"
                              : "bg-muted/70 text-foreground/90 hover:bg-muted/70 hover:text-foreground",
                            item.wide && "col-span-2"
                          )}
                        >
                          <Icon className="size-3.5" />
                          {item.label}
                          {item.badge && item.badge > 0 && (
                            <span className="rounded-full bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              {item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </SidebarGroupContent>

            {!isCompact && (
              <SidebarGroupContent>
                <CreateNewChat />
              </SidebarGroupContent>
            )}
          </SidebarGroup>

          {!isCompact && (
            <>
              {/* Group Chat */}
              <SidebarGroup>
                <div className="mb-1 flex items-center justify-between">
                  <SidebarGroupLabel className="section-eyebrow">
                    group chats
                  </SidebarGroupLabel>
                  <NewGroupChatModal />
                </div>

                <SidebarGroupContent>
                  {convoLoading ? <ConversationSkeleton /> : <GroupChatList />}
                </SidebarGroupContent>
              </SidebarGroup>

              {/* Direct Message */}
              <SidebarGroup>
                <div className="mb-1 flex items-center justify-between">
                  <SidebarGroupLabel className="section-eyebrow">
                    friends
                  </SidebarGroupLabel>
                  <div className="flex items-center gap-2">
                    <FriendsManagerDialog />
                    <AddFriendModal />
                  </div>
                </div>

                <SidebarGroupContent>
                  {convoLoading ? <ConversationSkeleton /> : <DirectMessageList />}
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter>
          {user && <NavUser user={user} compact={isCompact} />}
        </SidebarFooter>
      </Sidebar>

      {/* Appearance Drawer — portaled to body */}
      <AppearanceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
