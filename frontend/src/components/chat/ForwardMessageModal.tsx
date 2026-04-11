import { useEffect, useState, useMemo } from "react";
import { Search, Check, SendHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import UserAvatar from "./UserAvatar";
import GroupChatAvatar from "./GroupChatAvatar";
import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageId: string | null;
}

export const ForwardMessageModal = ({ isOpen, onClose, messageId }: ForwardMessageModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isForwarding, setIsForwarding] = useState(false);

  const { friends, getFriends } = useFriendStore();
  const { conversations, forwardMessage } = useChatStore();

  useEffect(() => {
    if (isOpen) {
      getFriends();
      setSearchQuery("");
      setSelectedUserIds([]);
      setSelectedGroupIds([]);
    }
  }, [isOpen, getFriends]);

  const groups = useMemo(() => {
    return conversations.filter((c) => c.type === "group");
  }, [conversations]);

  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const lowerQuery = searchQuery.toLowerCase();
    return friends.filter((f) => f.displayName.toLowerCase().includes(lowerQuery));
  }, [friends, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const lowerQuery = searchQuery.toLowerCase();
    return groups.filter((g) => g.group.name.toLowerCase().includes(lowerQuery));
  }, [groups, searchQuery]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const totalSelected = selectedUserIds.length + selectedGroupIds.length;

  const handleForward = async () => {
    if (!messageId || totalSelected === 0) return;
    setIsForwarding(true);
    await forwardMessage(messageId, selectedUserIds, selectedGroupIds);
    setIsForwarding(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-xl border-0 shadow-2xl bg-background/95 backdrop-blur-xl">
        <DialogHeader className="p-4 border-b border-border/40 pb-4">
          <DialogTitle className="text-lg font-semibold text-center">Forward Message</DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground/80">
            Select who you want to forward this message to
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-muted/20 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search friends or groups..."
              className="pl-9 h-9 text-sm rounded-full bg-background border-border/50 shadow-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto beautiful-scrollbar p-2">
          {filteredFriends.length === 0 && filteredGroups.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {filteredFriends.length > 0 && (
            <div className="mb-4">
              <h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Friends</h3>
              <div className="space-y-0.5 mt-1">
                {filteredFriends.map((friend) => (
                  <button
                    type="button"
                    key={friend._id}
                    onClick={() => toggleUser(friend._id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        type="chat"
                        name={friend.displayName}
                        avatarUrl={friend.avatarUrl || undefined}
                        className="size-9"
                        previewable={false}
                      />
                      <span className="text-[14.5px] font-medium leading-none">{friend.displayName}</span>
                    </div>
                    <div className={`size-5 rounded-full border flex items-center justify-center transition-all ${selectedUserIds.includes(friend._id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                      {selectedUserIds.includes(friend._id) && <Check className="size-3.5" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredGroups.length > 0 && (
            <div>
              <h3 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Groups</h3>
              <div className="space-y-0.5 mt-1">
                {filteredGroups.map((groupConv) => (
                  <button
                    type="button"
                    key={groupConv._id}
                    onClick={() => toggleGroup(groupConv._id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <GroupChatAvatar
                        participants={groupConv.participants}
                        type="chat"
                      />
                      <span className="text-[14.5px] font-medium leading-none">{groupConv.group.name}</span>
                    </div>
                    <div className={`size-5 rounded-full border flex items-center justify-center transition-all ${selectedGroupIds.includes(groupConv._id) ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/30'}`}>
                      {selectedGroupIds.includes(groupConv._id) && <Check className="size-3.5" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-3 md:p-4 border-t border-border/40 bg-background/50 backdrop-blur pb-4 md:pb-4 flex justify-between items-center">
          <span className="text-sm font-medium text-muted-foreground pl-1">
            {totalSelected > 0 ? `${totalSelected} selected` : ""}
          </span>
          <Button
            onClick={handleForward}
            disabled={totalSelected === 0 || isForwarding}
            className="rounded-full px-5 profile-action-gradient shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
          >
            <SendHorizontal className="size-4 mr-2" />
            {isForwarding ? "Sending..." : "Forward"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
