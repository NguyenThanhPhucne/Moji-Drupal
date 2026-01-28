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

const ChatWindowHeader = ({ chat }: { chat?: Conversation }) => {
  const { conversations, activeConversationId, loading } = useChatStore();
  const { user } = useAuthStore();
  const { onlineUsers } = useSocketStore();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  let otherUser;

  chat = chat ?? conversations.find((c) => c._id === activeConversationId);

  if (!chat) {
    return (
      <header className="md:hidden sticky top-0 z-10 flex items-center gap-2 px-4 py-2 w-full">
        <SidebarTrigger className="-ml-1 text-foreground" />
      </header>
    );
  }

  if (chat.type === "direct") {
    const otherUsers = chat.participants.filter((p) => p._id !== user?._id);
    otherUser = otherUsers.length > 0 ? otherUsers[0] : null;

    if (!user || !otherUser) return;
  }

  const handleDeleteConversation = async () => {
    try {
      setIsDeleting(true);
      await chatService.deleteConversation(chat._id);
      toast.success("Cuộc hội thoại đã bị xoá");
      setShowDeleteDialog(false);
      // Manually remove from store
      useChatStore.setState((state) => ({
        conversations: state.conversations.filter((c) => c._id !== chat._id),
        activeConversationId: null,
      }));
      navigate("/");
    } catch (error) {
      console.error("Error deleting conversation:", error);
      toast.error("Không thể xoá cuộc hội thoại");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 px-4 py-2 flex items-center bg-background">
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1 text-foreground" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />

            <div className="p-2 flex items-center gap-3">
              {/* avatar */}
              <div className="relative">
                {chat.type === "direct" ? (
                  <>
                    <UserAvatar
                      type={"sidebar"}
                      name={otherUser?.displayName || "Moji"}
                      avatarUrl={otherUser?.avatarUrl || undefined}
                    />
                    {/* todo: socket io */}
                    <StatusBadge
                      status={
                        onlineUsers.includes(otherUser?._id ?? "")
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
              <h2 className="font-semibold text-foreground">
                {chat.type === "direct"
                  ? otherUser?.displayName
                  : chat.group?.name}
              </h2>
            </div>
          </div>

          {/* Delete Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isDeleting}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive cursor-pointer"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Xoá cuộc hội thoại
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá cuộc hội thoại?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Toàn bộ tin nhắn sẽ bị xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConversation}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Đang xoá..." : "Xoá"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ChatWindowHeader;
