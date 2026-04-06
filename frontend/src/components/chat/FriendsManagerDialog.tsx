import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Trash2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
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

  const handleRemoveFriend = async (friendId: string, displayName: string) => {
    const confirmed = globalThis.confirm(
      `Remove ${displayName} from your friends list?`,
    );

    if (!confirmed) {
      return;
    }

    setProcessingFriendId(friendId);
    const result = await removeFriend(friendId);

    if (result.ok) {
      toast.success(result.message || `${displayName} was removed.`);
    } else {
      toast.error(result.message);
    }

    setProcessingFriendId(null);
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

      <DialogContent className="modal-content-shell sm:max-w-xl">
        <DialogHeader className="modal-stagger-item">
          <DialogTitle>Friends</DialogTitle>
          <DialogDescription>
            View your friends, start a chat, or remove a friend.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or username"
          className="modal-stagger-item"
        />

        <div className="max-h-[420px] min-h-[320px] space-y-2 overflow-y-auto pr-1 modal-stagger-item">
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
                  <Card
                    key={friend._id}
                    className="flex items-center gap-3 rounded-xl border border-border/70 p-3"
                  >
                    <FriendProfileMiniCard
                      userId={friend._id}
                      displayName={friend.displayName}
                      avatarUrl={friend.avatarUrl}
                      onViewProfile={() => {
                        setOpen(false);
                        navigate(`/profile/${friend._id}`);
                      }}
                      onChat={() => handleStartChat(friend._id)}
                      onRemove={() =>
                        handleRemoveFriend(friend._id, friend.displayName)
                      }
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

                    <div className="flex items-center gap-2">
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
                        onClick={() =>
                          handleRemoveFriend(friend._id, friend.displayName)
                        }
                        disabled={disabled}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Remove
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FriendsManagerDialog;
