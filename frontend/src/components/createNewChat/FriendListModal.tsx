import { useFriendStore } from "@/stores/useFriendStore";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { MessageCircleMore, Users } from "lucide-react";
import { Card } from "../ui/card";
import UserAvatar from "../chat/UserAvatar";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import DialogFriendListSkeleton from "@/components/skeleton/DialogFriendListSkeleton";

const FriendListModal = () => {
  const { friends, loading: friendLoading } = useFriendStore();
  const { createConversation, loading: chatLoading } = useChatStore();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const isBusy = friendLoading || chatLoading;
  const isInitialFriendsLoading = friendLoading && friends.length === 0;

  const handleAddConversation = async (friendId: string) => {
    try {
      setCreatingFor(friendId);
      const success = await createConversation("direct", "", [friendId]);

      if (success) {
        const friend = friends.find((f) => f._id === friendId);
        toast.success(
          `Conversation with ${friend?.displayName} opened successfully!`,
        );
      } else {
        toast.error("Cannot create conversation. Please try again!");
      }
    } catch (error) {
      console.error("[FriendListModal][error] Error:", error);
      toast.error("An error occurred. Please try again!");
    } finally {
      setCreatingFor(null);
    }
  };

  return (
    <DialogContent
      className="glass max-w-md"
      dismissible={!isBusy}
      showCloseButton={!isBusy}
    >
      <DialogHeader className="modal-stagger-item">
        <DialogTitle className="flex items-center gap-2 text-xl capitalize">
          <MessageCircleMore className="size-5" />
          start a new conversation
        </DialogTitle>
        <DialogDescription className="sr-only">
          Select a friend from the list to start a conversation
        </DialogDescription>
      </DialogHeader>

      {/* friends list */}
      <div className="space-y-4 modal-stagger-item">
        <h1 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
          friends list
        </h1>

        <div className="space-y-2 max-h-60 min-h-60 overflow-y-auto">
          {isInitialFriendsLoading ? (
            <DialogFriendListSkeleton count={5} />
          ) : (
            <>
              {friends.map((friend, index) => (
                <Card
                  onClick={() => handleAddConversation(friend._id)}
                  key={friend._id}
                  tabIndex={isBusy ? -1 : 0}
                  role="button"
                  data-autofocus={index === 0 ? "true" : undefined}
                  onKeyDown={(event) => {
                    if (isBusy) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleAddConversation(friend._id);
                    }
                  }}
                  className={cn(
                    "p-3 cursor-pointer transition-smooth hover:shadow-soft glass hover:bg-muted/40 group/friendCard",
                    isBusy && "pointer-events-none",
                    chatLoading && creatingFor === friend._id && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar
                        type="sidebar"
                        name={friend.displayName}
                        avatarUrl={friend.avatarUrl}
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <h2 className="font-semibold text-sm truncate">
                        {friend.displayName}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        @{friend.username}
                      </span>
                    </div>

                    {chatLoading && creatingFor === friend._id && (
                      <div className="text-xs text-muted-foreground">
                        Creating...
                      </div>
                    )}
                  </div>
                </Card>
              ))}

              {friends.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="size-12 mx-auto mb-3 opacity-50" />
                  No friends yet. Add friends to start chatting!
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DialogContent>
  );
};

export default FriendListModal;
