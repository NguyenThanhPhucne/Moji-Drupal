import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2, UserMinus, Users, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { Button } from "../ui/button";
// removed Card import
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/dialog";
import UserAvatar from "./UserAvatar";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import DialogFriendListSkeleton from "@/components/skeleton/DialogFriendListSkeleton";

const FriendsManagerDialog = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [processingFriendId, setProcessingFriendId] = useState<string | null>(
    null,
  );
  const [friendPendingRemoval, setFriendPendingRemoval] = useState<{
    friendId: string;
    displayName: string;
  } | null>(null);

  const { friends, getFriends, removeFriend, loading: friendLoading } =
    useFriendStore();
  const { createConversation, loading: chatLoading } = useChatStore();
  const isInitialFriendsLoading = friendLoading && friends.length === 0;

  useEffect(() => {
    if (open) {
      getFriends();
    }
  }, [open, getFriends]);

  const filteredFriends = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return friends;
    }

    return friends.filter((friend) => {
      const displayName = friend.displayName?.toLowerCase() ?? "";
      const username = friend.username?.toLowerCase() ?? "";
      return displayName.includes(normalized) || username.includes(normalized);
    });
  }, [friends, query]);

  const handleStartChat = async (friendId: string) => {
    try {
      setProcessingFriendId(friendId);
      const ok = await createConversation("direct", "", [friendId]);
      if (!ok) {
        toast.error("Could not open conversation. Please try again.");
        return;
      }
      setOpen(false);
    } finally {
      setProcessingFriendId(null);
    }
  };

  const requestRemoveFriend = (friendId: string, displayName: string) => {
    setFriendPendingRemoval({ friendId, displayName });
  };

  const handleRemoveFriend = async () => {
    if (!friendPendingRemoval) {
      return;
    }

    const { friendId, displayName } = friendPendingRemoval;

    setProcessingFriendId(friendId);
    const result = await removeFriend(friendId);

    if (result.ok) {
      toast.success(result.message || `${displayName} was removed.`);
    } else {
      toast.error(result.message);
    }

    setProcessingFriendId(null);
    setFriendPendingRemoval(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center size-5 rounded-full hover:bg-sidebar-accent/80 cursor-pointer"
          aria-label="Open friends list"
          title="Friends"
        >
          <Users className="size-4" />
        </button>
      </DialogTrigger>

      <DialogContent className="people-manager-modal sm:max-w-2xl">
        <DialogHeader className="modal-stagger-item">
          <DialogTitle>Friends</DialogTitle>
          <DialogDescription>
            View your friends, start a chat, or remove a friend.
          </DialogDescription>
        </DialogHeader>

        <div className="people-manager-toolbar modal-stagger-item">
          <div className="relative flex items-center w-full">
            <Search className="absolute left-3.5 size-[15px] text-muted-foreground/60 pointer-events-none" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or username"
              className="search-input-pill pl-9"
            />
          </div>

          <div className="people-manager-summary-row">
            <p className="people-manager-summary-text">
              Showing {filteredFriends.length} of {friends.length} friends
            </p>
            {query.trim() ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setQuery("")}
              >
                Clear search
              </Button>
            ) : null}
          </div>
        </div>

        <div className="people-manager-list-shell modal-stagger-item">
          <div className="people-manager-list-head">
            <span>People</span>
            <span>{filteredFriends.length}</span>
          </div>

          <div className="people-manager-list-scroll">
          {isInitialFriendsLoading ? (
            <DialogFriendListSkeleton count={6} showActions />
          ) : (
            <>
              {filteredFriends.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center mb-3 ring-4 ring-background shadow-sm">
                    <UserMinus className="size-5 text-muted-foreground/80" />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground/80">No friends found</p>
                  <p className="text-[11.5px] text-muted-foreground/70 mt-1 max-w-[200px]">
                    {query.trim()
                      ? `No matches for "${query}"`
                      : "You don't have any friends yet."}
                  </p>
                </div>
              )}

              {filteredFriends.map((friend) => {
                const busy = processingFriendId === friend._id;
                const disabled = busy || chatLoading;

                return (
                  <div
                    key={friend._id}
                    className="people-manager-row"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FriendProfileMiniCard
                      userId={friend._id}
                      displayName={friend.displayName}
                      avatarUrl={friend.avatarUrl}
                      onViewProfile={() => {
                        setOpen(false);
                        navigate(`/profile/${friend._id}`);
                      }}
                      onChat={() => handleStartChat(friend._id)}
                      onRemove={() => requestRemoveFriend(friend._id, friend.displayName)}
                      disabled={disabled}
                    >
                      <UserAvatar
                        type="sidebar"
                        name={friend.displayName}
                        avatarUrl={friend.avatarUrl}
                      />
                    </FriendProfileMiniCard>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {friend.displayName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          @{friend.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleStartChat(friend._id)}
                        disabled={disabled}
                      >
                        <MessageCircle className="size-4" />
                        Chat
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => requestRemoveFriend(friend._id, friend.displayName)}
                        disabled={disabled}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          </div>
        </div>
      </DialogContent>

      <AlertDialog
        open={Boolean(friendPendingRemoval)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !processingFriendId) {
            setFriendPendingRemoval(null);
          }
        }}
      >
        <AlertDialogContent
          className="chat-modal-shell chat-modal-shell--danger max-w-sm"
          aria-busy={Boolean(processingFriendId)}
        >
          <AlertDialogHeader className="items-center text-center modal-stagger-item">
            <div className="dialog-danger-icon">
              <UserMinus className="size-6" />
            </div>
            <AlertDialogTitle className="text-base font-semibold">Remove friend?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {friendPendingRemoval
                ? `This is a permanent action. ${friendPendingRemoval.displayName} will be removed from your friends list and quick chat access.`
                : "This is a permanent action. The selected friend will be removed from your friends list."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter className="sm:flex-col-reverse gap-2 sm:gap-2 mt-4 modal-stagger-item">
            <AlertDialogCancel
              className="mt-0 sm:mt-0"
              onClick={() => setFriendPendingRemoval(null)}
              disabled={Boolean(processingFriendId)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleRemoveFriend()}
              disabled={Boolean(processingFriendId)}
            >
              {processingFriendId ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

export default FriendsManagerDialog;
