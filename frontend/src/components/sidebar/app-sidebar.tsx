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
          "chat-sidebar-shell border-r border-border/60 bg-sidebar/90 backdrop-blur-xl transition-[width] duration-300",
          isCompact && "chat-sidebar-compact",
        )}
        style={
          isCompact
            ? ({ "--sidebar-width": "56px" } as React.CSSProperties)
            : undefined
        }
        {...props}
      >
        <SidebarHeader className="pb-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <div className={cn(
                "chat-sidebar-brand flex w-full items-center justify-between px-3 py-2.5",
                isCompact && "px-1 justify-center"
              )}>
                {!isCompact && (
                  <div className="flex items-center gap-2">
                    <div className="chat-sidebar-brand-mark size-7 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0 transition-all duration-200 hover:shadow-md hover:shadow-primary/30 hover:scale-105">
                      <span className="text-[13px] font-black text-white tracking-tight">M</span>
                    </div>
                    <div>
                      <h1 className="text-[15px] font-bold text-foreground tracking-tight leading-none">
                        Moji
                      </h1>
                      <p className="text-[10px] text-muted-foreground/60 leading-none mt-0.5">
                        Messaging
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  data-keep-chat-open="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDrawerOpen(true);
                  }}
                  title="Appearance"
                  aria-label="Open appearance settings"
                  className={cn(
                    "flex items-center justify-center rounded-full size-8 text-muted-foreground/70 hover:bg-muted/80 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  )}
                >
                  <Palette className="size-4" />
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
                <div className="flex flex-col items-center gap-1 py-1">
                  {[...navItems, ...bottomNavItems].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        aria-current={item.isActive ? "page" : undefined}
                        onClick={() => navigate(item.to)}
                        className={cn(
                          "chat-sidebar-nav-tab chat-sidebar-nav-tab--rail relative flex size-10 items-center justify-center rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                          item.isActive
                            ? "bg-primary/10 text-primary sidebar-tab-active chat-sidebar-nav-tab--active"
                            : "text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground hover:scale-105"
                        )}
                      >
                        <Icon className={cn("size-5", item.isActive && "stroke-[2.25]")} />
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute top-1 right-1 flex size-[7px] rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* ── Full: single-row horizontal tab bar ──────────────── */
                <div className="flex gap-1 px-1 pb-1">
                  {[...navItems, ...bottomNavItems].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        aria-current={item.isActive ? "page" : undefined}
                        onClick={() => navigate(item.to)}
                        title={item.label}
                        className={cn(
                          "chat-sidebar-nav-tab chat-sidebar-nav-tab--full relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          item.isActive
                            ? "bg-primary/[0.09] text-primary sidebar-tab-active chat-sidebar-nav-tab--active"
                            : "text-muted-foreground/65 hover:bg-muted/50 hover:text-foreground/80 hover:scale-[1.03]",
                        )}
                      >
                        <Icon className={cn("size-[18px]", item.isActive && "stroke-[2.2]")} />
                        <span className="leading-none">{item.label}</span>
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute top-1.5 right-2 flex size-[7px] rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
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
