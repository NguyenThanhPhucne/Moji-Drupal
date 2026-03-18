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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Bookmark, MessageSquare, Moon, Sun } from "lucide-react";
import { Switch } from "../ui/switch";
import CreateNewChat from "../chat/CreateNewChat";
import NewGroupChatModal from "../chat/NewGroupChatModal";
import GroupChatList from "../chat/GroupChatList";
import AddFriendModal from "../chat/AddFriendModal";
import DirectMessageList from "../chat/DirectMessageList";
import FriendsManagerDialog from "../chat/FriendsManagerDialog";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import ConversationSkeleton from "../skeleton/ConversationSkeleton";
import { useChatStore } from "@/stores/useChatStore";
import { useLocation, useNavigate } from "react-router-dom";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isDark, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();
  const { convoLoading } = useChatStore();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Sidebar
      data-chat-sidebar="true"
      variant="inset"
      className="border-r border-border/60 bg-sidebar/90 backdrop-blur-xl"
      {...props}
    >
      {/* Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="shadow-soft">
              <div className="flex w-full items-center justify-between rounded-2xl bg-gradient-primary px-3 py-2.5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
                    Workspace
                  </p>
                  <h1 className="text-base font-bold text-white tracking-[0.02em]">
                    Coming
                  </h1>
                  <p className="text-[11px] text-white/80">
                    Realtime Messaging
                  </p>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-2 py-1">
                  <Sun className="size-3.5 text-white/80" />
                  <Switch
                    checked={isDark}
                    onCheckedChange={toggleTheme}
                    className="scale-90 data-[state=checked]:bg-background/80"
                  />
                  <Moon className="size-3.5 text-white/80" />
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent className="beautiful-scrollbar px-1">
        {/* New Chat */}
        <SidebarGroup>
          <SidebarGroupContent>
            <div className="grid grid-cols-2 gap-2 p-2">
              <button
                type="button"
                onClick={() => navigate("/")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all ${
                  location.pathname === "/"
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "bg-muted/70 hover:bg-muted"
                }`}
              >
                <MessageSquare className="size-3.5" />
                Chats
              </button>
              <button
                type="button"
                onClick={() => navigate("/saved")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all ${
                  location.pathname === "/saved"
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "bg-muted/70 hover:bg-muted"
                }`}
              >
                <Bookmark className="size-3.5" />
                Saved
              </button>
            </div>
          </SidebarGroupContent>

          <SidebarGroupContent>
            <CreateNewChat />
          </SidebarGroupContent>
        </SidebarGroup>

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

        {/* Dirrect Message */}
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
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
