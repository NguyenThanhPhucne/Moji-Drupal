import { useFriendStore } from "@/stores/useFriendStore";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogOverlay,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { UserPlus, Users } from "lucide-react";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import type { Friend } from "@/types/user";
import IniviteSuggestionList from "../newGroupChat/IniviteSuggestionList";
import SelectedUsersList from "../newGroupChat/SelectedUsersList";
import { toast } from "sonner";
import { useChatStore } from "@/stores/useChatStore";

const NewGroupChatModal = () => {
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { friends, getFriends } = useFriendStore();
  const [invitedUsers, setInvitedUsers] = useState<Friend[]>([]);
  const { loading, createConversation } = useChatStore();

  const handleGetFriends = async () => {
    await getFriends();
  };

  const handleSelectFriend = (friend: Friend) => {
    setInvitedUsers([...invitedUsers, friend]);
    setSearch("");
  };

  const handleRemoveFriend = (friend: Friend) => {
    setInvitedUsers(invitedUsers.filter((u) => u._id !== friend._id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    try {
      e.preventDefault();

      if (!groupName.trim()) {
        toast.error("Please enter a group name");
        return;
      }

      if (invitedUsers.length === 0) {
        toast.error("You must invite at least 1 member");
        return;
      }

      const memberIds = invitedUsers.map((u) => u._id);

      const success = await createConversation("group", groupName, memberIds);

      if (success) {
        toast.success(`Group "${groupName}" created successfully!`);
        setGroupName("");
        setSearch("");
        setInvitedUsers([]);
        setOpen(false);
      } else {
        toast.error("Cannot create group. Please try again!");
      }
    } catch (error) {
      console.error("[NewGroupChatModal][error] Error:", error);
      toast.error("An error occurred. Please try again!");
    }
  };

  const filteredFriends = friends.filter((friend) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      friend.displayName?.toLowerCase().includes(searchLower) ||
      friend.username?.toLowerCase().includes(searchLower);
    const notInvited = !invitedUsers.some((u) => u._id === friend._id);
    return matchesSearch && notInvited;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="completeGhost"
          size="icon-sm"
          onClick={handleGetFriends}
          className="rounded-full text-sidebar-foreground/90 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground transition-colors duration-150"
        >
          <Users className="size-4" />
          <span className="sr-only">Create group</span>
        </Button>
      </DialogTrigger>

      <DialogOverlay className="modal-overlay" />
      <DialogContent
        className="modal-content-shell sm:max-w-[425px] border-none"
        dismissible={!loading}
        showCloseButton={!loading}
      >
        <DialogHeader className="modal-stagger-item">
          <DialogTitle className="capitalize">
            create a new group chat
          </DialogTitle>
          <DialogDescription className="sr-only">
            Create a new group chat with friends
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4 modal-stagger-item" onSubmit={handleSubmit}>
          {/* group name */}
          <div className="space-y-2">
            <Label htmlFor="groupName" className="text-sm font-semibold">
              Group name
            </Label>
            <Input
              id="groupName"
              data-autofocus="true"
              placeholder="Enter group name..."
              className="glass border-border/50 focus:border-primary/50 transition-smooth"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* invite members */}
          <div className="space-y-2">
            <Label htmlFor="invite" className="text-sm font-semibold">
              Invite members
            </Label>

            <Input
              id="invite"
              placeholder="Search by name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={loading}
              className="flex-1"
            />

            {/* suggestion list */}
            {search && filteredFriends.length > 0 && (
              <IniviteSuggestionList
                filteredFriends={filteredFriends}
                onSelect={handleSelectFriend}
              />
            )}

            {/* selected users list */}
            <SelectedUsersList
              invitedUsers={invitedUsers}
              onRemove={handleRemoveFriend}
            />
          </div>

          <DialogFooter className="modal-stagger-item">
            <Button
              type="submit"
              disabled={loading || invitedUsers.length === 0}
              className="flex-1 bg-gradient-chat text-white hover:opacity-90 transition-smooth"
            >
              {loading ? (
                <span>Creating...</span>
              ) : (
                <>
                  <UserPlus className="size-4 mr-2" />
                  Create group
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewGroupChatModal;
