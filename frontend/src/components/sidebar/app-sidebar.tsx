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
import React, { useState } from "react";
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

  const navItems: Array<{
    key: string;
    label: string;
    icon: LucideIcon;
    to: string;
    isActive: boolean;
    badge?: number;
  }> = [
    {
      key: "chats",
      label: "Chats",
      icon: MessageSquare,
      to: "/",
      isActive: location.pathname === "/",
    },
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
  ];

  const bottomNavItems: Array<{
    key: string;
    label: string;
    icon: LucideIcon;
    to: string;
    isActive: boolean;
    badge?: number;
  }> = [
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
    },
  ];

  return (
    <>
      <Sidebar
        data-chat-sidebar="true"
        variant="inset"
        className={cn(
          "border-r border-border/60 bg-sidebar/90 backdrop-blur-xl transition-[width] duration-300",
          isCompact && "chat-sidebar-compact",
        )}
        style={
          isCompact
            ? ({ "--sidebar-width": "56px" } as React.CSSProperties)
            : undefined
        }
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
                  {[...navItems, ...bottomNavItems].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        title={item.label}
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
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                            {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* ── Full: nav grid (3-col top + 2-col bottom) ──────────── */
                <div className="flex flex-col gap-1 p-1">
                  {/* Top row: Chats / Feed / Explore */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => navigate(item.to)}
                          className={cn(
                            "relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-all duration-200",
                            item.isActive
                              ? "bg-primary text-primary-foreground shadow-soft"
                              : "bg-muted/50 text-foreground/80 hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          <span className="leading-none">{item.label}</span>
                          {(item.badge ?? 0) > 0 && (
                            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                              {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Bottom row: Saved / Profile — 2 equal columns */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {bottomNavItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => navigate(item.to)}
                          className={cn(
                            "relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold transition-all duration-200",
                            item.isActive
                              ? "bg-primary text-primary-foreground shadow-soft"
                              : "bg-muted/50 text-foreground/80 hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          <span className="leading-none">{item.label}</span>
                          {(item.badge ?? 0) > 0 && (
                            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                              {(item.badge ?? 0) > 9 ? "9+" : item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
