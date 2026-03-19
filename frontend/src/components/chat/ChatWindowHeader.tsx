import { useChatStore } from "@/stores/useChatStore";
import type { Conversation } from "@/types/chat";
import { SidebarTrigger } from "../ui/sidebar";
import { useAuthStore } from "@/stores/useAuthStore";
import { Separator } from "../ui/separator";
import UserAvatar from "./UserAvatar";
import StatusBadge from "./StatusBadge";
import GroupChatAvatar from "./GroupChatAvatar";
import { useSocketStore } from "@/stores/useSocketStore";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { MoreVertical, Trash2 } from "lucide-react";
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
import { chatService } from "@/services/chatService";
import GlobalSearchDialog from "./GlobalSearchDialog";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import { useFriendStore } from "@/stores/useFriendStore";

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFriendActionLoading, setIsFriendActionLoading] = useState(false);
  const navigate = useNavigate();
  const { createConversation, setActiveConversation, fetchMessages } =
    useChatStore();
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
    const otherUsers = chat.participants.filter(
      (p) => String(p._id) !== String(user?._id),
    );
    otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

    if (!user || !otherUser) return null;
  }

  let presenceText = `${chat.participants.length} members`;
  if (chat.type === "direct") {
    const isOnline = onlineUsers.includes(String(otherUser?._id ?? ""));
    presenceText = isOnline ? "Active now" : "Offline";
  }

  const handleDeleteConversation = async () => {
    try {
      setIsDeleting(true);
      await chatService.deleteConversation(chat._id);
      toast.success("Conversation deleted");
      setShowDeleteDialog(false);
      // Manually remove from store
      useChatStore.setState((state) => ({
        conversations: state.conversations.filter((c) => c._id !== chat._id),
        activeConversationId: null,
      }));
      navigate("/");
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Cannot delete conversation");
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
      <header className="sticky top-0 z-10 flex items-center border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1 text-foreground" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />

            <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/65 px-3 py-2 shadow-sm transition-colors hover:bg-card/90">
              {/* avatar */}
              <div className="relative">
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
                      status={
                        onlineUsers.includes(String(otherUser?._id ?? ""))
                          ? "online"
                          : "offline"
                      }
                    />
                  </>
                ) : (
                  <GroupChatAvatar
                    participants={chat.participants}
                    type="sidebar"
                  />
                )}
              </div>

              {/* name */}
              <div className="min-w-0">
                <h2 className="truncate font-semibold tracking-[-0.01em] text-foreground">
                  {chat.type === "direct"
                    ? otherUser?.displayName
                    : chat.group?.name}
                </h2>
                <p className="text-xs text-muted-foreground">{presenceText}</p>
              </div>
            </div>
          </div>

          <GlobalSearchDialog />

          {/* Delete Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={isDeleting}
                className="rounded-xl border border-transparent hover:border-border/60 hover:bg-muted/60"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive cursor-pointer"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All messages will be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ChatWindowHeader;
