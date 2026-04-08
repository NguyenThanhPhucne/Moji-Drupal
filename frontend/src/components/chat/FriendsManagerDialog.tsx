import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2, UserMinus, Users } from "lucide-react";
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
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or username"
          />

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
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  No friends found.
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

      <Dialog
        open={Boolean(friendPendingRemoval)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !processingFriendId) {
            setFriendPendingRemoval(null);
          }
        }}
      >
        <DialogContent
          contentClassMode="bare"
          className="social-confirm-dialog social-confirm-dialog--warning sm:max-w-md"
        >
          <DialogHeader className="social-confirm-head modal-stagger-item">
            <span className="social-confirm-icon social-confirm-icon--warning" aria-hidden="true">
              <UserMinus className="h-4.5 w-4.5" />
            </span>
            <div>
              <DialogTitle className="social-confirm-title">Remove friend?</DialogTitle>
              <DialogDescription className="social-confirm-description">
                {friendPendingRemoval
                  ? `This is a permanent action. ${friendPendingRemoval.displayName} will be removed from your friends list and quick chat access.`
                  : "This is a permanent action. The selected friend will be removed from your friends list."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="social-confirm-actions modal-stagger-item">
            <Button
              type="button"
              variant="outline"
              className="social-confirm-cancel"
              onClick={() => setFriendPendingRemoval(null)}
              disabled={Boolean(processingFriendId)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="social-confirm-danger social-confirm-danger--warning"
              onClick={() => void handleRemoveFriend()}
              disabled={Boolean(processingFriendId)}
            >
              {processingFriendId ? "Removing..." : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default FriendsManagerDialog;
