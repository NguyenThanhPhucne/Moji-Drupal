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
  SidebarSeparator,
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
import React, { useMemo, useState } from "react";
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
  const { convoLoading, conversations } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const unreadChatCount = useMemo(() => {
    const currentUserId = String(user?._id || "");
    if (!currentUserId) {
      return 0;
    }

    return (conversations || []).reduce((sum, conversation) => {
      const unread = Number(conversation.unreadCounts?.[currentUserId] || 0);
      return sum + (Number.isFinite(unread) ? unread : 0);
    }, 0);
  }, [conversations, user?._id]);

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
      badge: unreadChatCount,
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
          "chat-sidebar-shell chat-sidebar-shell--command border-r border-border/60 bg-sidebar/90 backdrop-blur-xl transition-[width] duration-300",
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
                "chat-sidebar-brand chat-sidebar-brand--command flex w-full items-center justify-between px-3 py-2.5",
                isCompact && "px-1 justify-center"
              )}>
                {!isCompact && (
                  <div className="flex items-center gap-2">
                    <div className="chat-sidebar-brand-mark chat-sidebar-brand-mark--command size-7 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0 transition-[box-shadow,background-color] duration-200 hover:shadow-sm hover:shadow-primary/20">
                      <span className="text-[13px] font-black text-white tracking-tight">M</span>
                    </div>
                    <div>
                      <h1 className="text-[15px] font-bold text-foreground tracking-tight leading-none">
                        Moji
                      </h1>
                      <p className="text-[10px] text-muted-foreground/60 leading-none mt-0.5">
                        Workspace
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
                <div className="chat-sidebar-nav-rail flex flex-col items-center gap-1 py-1">
                  <div className="flex flex-col items-center gap-1">
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
                            "chat-sidebar-nav-tab chat-sidebar-nav-tab--command chat-sidebar-nav-tab--rail relative flex size-10 items-center justify-center rounded-xl transition-[background-color,color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                            item.isActive
                              ? "bg-primary/10 text-primary sidebar-tab-active chat-sidebar-nav-tab--active"
                              : "text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          <Icon className={cn("size-5", item.isActive && "stroke-[2.25]")} />
                          {(item.badge ?? 0) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                              {item.badge && item.badge > 99 ? "99+" : item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <SidebarSeparator className="mx-0 my-1.5 w-7" />

                  <div className="flex flex-col items-center gap-1.5">
                    <CreateNewChat compact />
                    <NewGroupChatModal />
                    <FriendsManagerDialog />
                    <AddFriendModal />
                  </div>
                </div>
              ) : (
                /* ── Full: single-row horizontal tab bar ──────────────── */
                <div className="chat-sidebar-nav-grid flex gap-1 px-1 pb-1">
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
                          "chat-sidebar-nav-tab chat-sidebar-nav-tab--command chat-sidebar-nav-tab--full relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-[background-color,color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          item.isActive
                            ? "bg-primary/[0.09] text-primary sidebar-tab-active chat-sidebar-nav-tab--active"
                            : "text-muted-foreground/65 hover:bg-muted/50 hover:text-foreground/80",
                        )}
                      >
                        <Icon className={cn("size-[18px]", item.isActive && "stroke-[2.2]")} />
                        <span className="leading-none">{item.label}</span>
                        {(item.badge ?? 0) > 0 && (
                          <span className="absolute top-1 right-1.5 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                            {item.badge && item.badge > 99 ? "99+" : item.badge}
                          </span>
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
