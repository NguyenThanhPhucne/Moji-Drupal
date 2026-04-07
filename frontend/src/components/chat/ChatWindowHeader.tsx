import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { MoreVertical, Trash2, Phone, Video, UserCircle, Users, Circle } from "lucide-react";
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

function getPresenceText(
  chat: Conversation,
  otherUserId: string | undefined,
  getUserPresence: (userId?: string) => "online" | "recently-active" | "offline",
) {
  if (chat.type !== "direct") {
    return `${chat.participants.length} members`;
  }

  const presence = getUserPresence(otherUserId);
  if (presence === "online") return "Active now";
  if (presence === "recently-active") return "Recently active";
  return "Offline";
}

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId } = useChatStore();
  const { user } = useAuthStore();
  const { getUserPresence } = useSocketStore();
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

  const presenceText = getPresenceText(chat, otherUser?._id, getUserPresence);
  const contextLabel = chat.type === "direct" ? "Direct message" : "Group chat";

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
      <header className="chat-header-shell sticky top-0 z-10 flex items-center px-3 py-2">
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Sidebar toggle — only on mobile */}
            <SidebarTrigger className="-ml-0.5 text-foreground md:hidden" />

            {/* Avatar + name */}
            <div className="chat-header-identity flex items-center gap-3 rounded-xl px-2 py-1.5 cursor-pointer min-w-0">
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
              <div key={chat._id} className="header-info-enter min-w-0">
                <h2 className="truncate font-semibold tracking-[-0.01em] text-[15px] text-foreground">
                  {chat.type === "direct"
                    ? otherUser?.displayName
                    : chat.group?.name}
                </h2>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="chat-header-context-pill">
                    {chat.type === "direct" ? (
                      <Circle className="size-2.5 fill-current" />
                    ) : (
                      <Users className="size-2.5" />
                    )}
                    {contextLabel}
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-none">
                    {presenceText}
                  </p>
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
                  className="chat-header-action-btn hidden md:flex"
                >
                  <Phone className="h-4 w-4" />
                </Button>

                {/* Video call quick action */}
                <Button
                  variant="ghost"
                  size="icon"
                  title="Video call"
                  aria-label="Start video call"
                  onClick={() => {}}
                  className="chat-header-action-btn hidden md:flex"
                >
                  <Video className="h-4 w-4" />
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
                  className="chat-header-action-btn"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="chat-header-dropdown w-52">
                {chat.type === "direct" && otherUser?._id && (
                  <DropdownMenuItem
                    onSelect={() => navigate(`/profile/${String(otherUser._id)}`)}
                    className="chat-header-dropdown-item"
                  >
                    <UserCircle className="h-4 w-4 mr-2" />
                    View profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setTimeout(() => setShowDeleteDialog(true), 100)}
                  className="chat-header-dropdown-item chat-header-dropdown-item--danger"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
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
          className="chat-modal-shell max-w-sm"
          aria-busy={isDeleting}
        >
          <AlertDialogHeader className="items-center text-center modal-stagger-item">
            <div className="dialog-danger-icon">
              <Trash2 className="size-6" />
            </div>
            <AlertDialogTitle className="text-base font-semibold">
              Delete this conversation?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              This will permanently remove all messages for{" "}
              <span className="font-medium text-foreground">
                {chat.type === "direct"
                  ? otherUser?.displayName ?? "this contact"
                  : chat.group?.name ?? "this group"}
              </span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-col-reverse gap-2 modal-stagger-item">
            <AlertDialogCancel disabled={isDeleting} className="chat-modal-btn chat-modal-btn--secondary w-full">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="chat-modal-btn chat-modal-btn--danger w-full"
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
