import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import { cn, formatOnlineTime } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { MoreVertical, Trash2, Phone, Video, UserCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/dialog";
import { useNavigate } from "react-router-dom";
import GlobalSearchDialog from "./GlobalSearchDialog";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import { useFriendStore } from "@/stores/useFriendStore";

function resolveDirectPeer(chat: Conversation, userId?: string) {
  if (chat.type !== "direct") {
    return null;
  }

  const otherUsers = chat.participants.filter((participant) => String(participant._id) !== String(userId));
  return otherUsers.length > 0 ? otherUsers[0] : null;
}

function getGroupPresenceText(
  chat: Conversation,
  onlineUsers: string[],
) {
  const total = chat.participants.length;
  const onlineSet = new Set(onlineUsers);
  const onlineCount = chat.participants.filter(
    (p) => onlineSet.has(String(p._id)),
  ).length;

  if (onlineCount > 0) {
    return `${total} members · ${onlineCount} online`;
  }
  return `${total} members`;
}

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId } = useChatStore();
  const { user } = useAuthStore();
  const { getUserPresence, getLastActiveAt, onlineUsers } = useSocketStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const navigate = useNavigate();
  const {
    createConversation,
    setActiveConversation,
    fetchMessages,
    deleteConversation,
  } = useChatStore();
  const { removeFriend } = useFriendStore();

  let otherUser: Conversation["participants"][number] | null = null;

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  if (!chat) {
    return (
      <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
      </header>
    );
  }

  if (chat.type === "direct") {
    otherUser = resolveDirectPeer(chat, user?._id);
    if (!user || !otherUser) return null;
  }

  const groupPresenceText = chat.type === "group"
    ? getGroupPresenceText(chat, onlineUsers)
    : null;
  // contextLabel kept for future use (e.g. tooltip, accessibility aria-label)

  const handleDeleteConversation = async () => {
    try {
      setIsDeleting(true);
      const ok = await deleteConversation(chat._id);
      if (ok) {
        toast.success("Conversation deleted");
        setShowDeleteDialog(false);
        navigate("/");
      } else {
        toast.error("Cannot delete conversation");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleQuickChat = async () => {
    if (!otherUser?._id) {
      return;
    }

    if (chat?.type === "direct") {
      setActiveConversation(chat._id);
      await fetchMessages(chat._id);
      return;
    }

    await createConversation("direct", "", [String(otherUser._id)]);
  };

  const handleRemoveFriend = async () => {
    if (!otherUser?._id) {
      return;
    }

    try {
      setIsFriendActionLoading(true);
      const result = await removeFriend(String(otherUser._id));
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsFriendActionLoading(false);
    }
  };

  return (
    <>
      <header className="gradient-border-bottom chat-window-header bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex items-center px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* Sidebar toggle — only on mobile */}
            <SidebarTrigger className="-ml-0.5 text-foreground md:hidden" />

            {/* Avatar + name */}
            <div
              className={cn(
                "chat-header-identity chat-header-identity--enterprise",
                chat.type === "direct"
                  ? "chat-header-identity--direct"
                  : "chat-header-identity--group",
              )}
            >
              {/* avatar */}
              <div className="relative flex-shrink-0">
                {chat.type === "direct" ? (
                  <>
                    <FriendProfileMiniCard
                      userId={String(otherUser?._id || "")}
                      displayName={otherUser?.displayName || "Coming"}
                      avatarUrl={otherUser?.avatarUrl || undefined}
                      onViewProfile={() =>
                        navigate(`/profile/${String(otherUser?._id || "")}`)
                      }
                      onChat={handleQuickChat}
                      onRemove={handleRemoveFriend}
                      disabled={isFriendActionLoading}
                    >
                      <UserAvatar
                        type={"sidebar"}
                        name={otherUser?.displayName || "Coming"}
                        avatarUrl={otherUser?.avatarUrl || undefined}
                      />
                    </FriendProfileMiniCard>
                    <StatusBadge
                      status={getUserPresence(otherUser?._id)}
                      userId={otherUser?._id}
                    />
                  </>
                ) : (
                  <GroupChatAvatar
                    participants={chat.participants}
                    type="sidebar"
                  />
                )}
              </div>

              {/* name + presence */}
              <div key={chat._id} className="min-w-0 flex flex-col justify-center">
                <h2 className="truncate font-semibold tracking-tight text-[15px] text-foreground transition-colors">
                  {chat.type === "direct"
                    ? otherUser?.displayName
                    : chat.group?.name}
                </h2>
                <div className="flex items-center gap-1.5 mt-[2px]">
                  {chat.type === "direct" && (() => {
                    const pres = getUserPresence(otherUser?._id);
                    const lastActiveAt = getLastActiveAt(otherUser?._id);
                    if (pres === "online") {
                        return (
                          <span className="flex items-center gap-1.5">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                            </span>
                            <span className="presence-pill-online">
                              Active now
                            </span>
                          </span>
                        );
                    }
                    if (pres === "recently-active" && lastActiveAt) {
                      const timeStr = formatOnlineTime(new Date(lastActiveAt));
                      return (
                        <span className="text-[12px] text-muted-foreground font-medium leading-none">
                          Active {timeStr} ago
                        </span>
                      );
                    }
                    return (
                      <span className="text-[12px] text-muted-foreground/60 font-medium leading-none">
                        Offline
                      </span>
                    );
                  })()}
                  {chat.type === "group" && (
                    <span className="text-[12px] text-muted-foreground font-medium leading-none">
                      {groupPresenceText}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <GlobalSearchDialog />

              {/* Phone call quick action */}
            {chat.type === "direct" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Voice call"
                  aria-label="Start voice call"
                  onClick={() => {}}
                  className="hidden md:flex rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 hover:scale-110 active:scale-95"
                >
                  <Phone className="h-[18px] w-[18px]" />
                </Button>

                {/* Video call quick action */}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Video call"
                  aria-label="Start video call"
                  onClick={() => {}}
                  className="hidden md:flex rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150 hover:scale-110 active:scale-95"
                >
                  <Video className="h-[20px] w-[20px]" />
                </Button>
              </>
            )}

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isDeleting}
                  aria-label="Open conversation actions"
                  className="rounded-full text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors ml-1"
                >
                  <MoreVertical className="h-[18px] w-[18px]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border-border/60 overflow-hidden p-1">
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 focus:bg-black/5 dark:focus:bg-white/10"
                  >
                    <UserCircle className="h-[18px] w-[18px] text-muted-foreground" />
                    View profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="bg-border/60 mx-1" />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="gap-2 cursor-pointer rounded-lg font-medium text-[13px] py-1.5 text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-500/10 dark:focus:text-red-300"
                >
                  <Trash2 className="h-[18px] w-[18px]" />
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent
          className="max-w-md rounded-2xl p-6 gap-6 outline-none bg-background border border-border/50 shadow-2xl transition-all"
          aria-busy={isDeleting}
        >
          <AlertDialogHeader className="items-center text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20 ring-8 ring-red-50 dark:ring-red-500/10">
              <Trash2 className="size-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="space-y-1.5">
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                Delete this conversation?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[15px] font-medium leading-relaxed text-muted-foreground/80 px-2">
                This will permanently remove all messages for{" "}
                <strong className="font-semibold text-foreground">
                  {chat.type === "direct"
                    ? otherUser?.displayName ?? "this contact"
                    : chat.group?.name ?? "this group"}
                </strong>. 
                This action cannot be undone.
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row gap-3 sm:space-x-0 pt-2 w-full">
            <AlertDialogCancel disabled={isDeleting} className="flex-1 rounded-full h-11 font-semibold border-border/60 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className={cn(
                "flex-1 rounded-full h-11 font-semibold text-white transition-all shadow-sm",
                "bg-red-600 hover:bg-red-700 hover:shadow-md active:scale-[0.98]",
                isDeleting && "opacity-70 pointer-events-none"
              )}
            >
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ChatWindowHeader;
