import { useEffect, useState, useMemo, useRef } from "react";
import { Search, Check, SendHorizontal, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import UserAvatar from "./UserAvatar";
import GroupChatAvatar from "./GroupChatAvatar";
import { useFriendStore } from "@/stores/useFriendStore";
import { useChatStore } from "@/stores/useChatStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const searchRef = useRef<HTMLInputElement>(null);

  const { friends, getFriends } = useFriendStore();
  const { conversations, forwardMessage } = useChatStore();

  useEffect(() => {
    if (isOpen) {
      getFriends();
      setSearchQuery("");
      setSelectedUserIds([]);
      setSelectedGroupIds([]);
      setTimeout(() => searchRef.current?.focus(), 80);
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

  const selectedFriends = useMemo(() => friends.filter(f => selectedUserIds.includes(f._id)), [friends, selectedUserIds]);
  const selectedGroups = useMemo(() => groups.filter(g => selectedGroupIds.includes(g._id)), [groups, selectedGroupIds]);

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
    const result = await forwardMessage(messageId, selectedUserIds, selectedGroupIds);
    setIsForwarding(false);
    if (result.ok) {
      toast.success(`Forwarded to ${totalSelected} ${totalSelected === 1 ? "recipient" : "recipients"}`);
    } else {
      toast.error(result.message || "Failed to forward message");
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[400px] p-0 overflow-hidden rounded-2xl border border-border/50 shadow-2xl bg-background/98 backdrop-blur-2xl">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/30">
          <DialogTitle className="text-[15px] font-semibold text-center tracking-tight">Forward Message</DialogTitle>
          <DialogDescription className="text-center text-[11.5px] text-muted-foreground/70 mt-0.5">
            Select who you want to forward this to
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-3 py-2.5 bg-muted/10 border-b border-border/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
            <Input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search friends or groups..."
              className="pl-8 h-8 text-[13px] rounded-full bg-background/80 border-border/40 shadow-none focus:border-primary/50"
            />
          </div>
        </div>

        {/* Selected recipients chips */}
        {totalSelected > 0 && (
          <div className="px-3 py-2 bg-muted/5 border-b border-border/15 flex items-center gap-1.5 flex-wrap">
            {selectedFriends.map((friend) => (
              <button
                key={friend._id}
                type="button"
                onClick={() => toggleUser(friend._id)}
                className="chip-fly-in inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11.5px] font-medium text-primary hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors group"
              >
                <UserAvatar
                  type="chat"
                  name={friend.displayName}
                  avatarUrl={friend.avatarUrl || undefined}
                  className="size-4 text-[8px]"
                  previewable={false}
                />
                {friend.displayName.split(" ")[0]}
                <X className="size-3 opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            {selectedGroups.map((group) => (
              <button
                key={group._id}
                type="button"
                onClick={() => toggleGroup(group._id)}
                className="chip-fly-in inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11.5px] font-medium text-primary hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors group"
              >
                <span className="size-4 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                  {group.group.name.charAt(0).toUpperCase()}
                </span>
                {group.group.name.split(" ")[0]}
                <X className="size-3 opacity-60 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div className="max-h-[300px] overflow-y-auto beautiful-scrollbar px-1.5 py-1.5">
          {filteredFriends.length === 0 && filteredGroups.length === 0 && (
            <div className="py-10 flex flex-col items-center gap-2 text-muted-foreground/60">
              <span className="text-2xl">🔍</span>
              <p className="text-[12.5px]">No results found</p>
            </div>
          )}

          {filteredFriends.length > 0 && (
            <div className="mb-2">
              <h3 className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Friends</h3>
              <div className="space-y-px">
                {filteredFriends.map((friend) => {
                  const isSelected = selectedUserIds.includes(friend._id);
                  return (
                    <button
                      type="button"
                      key={friend._id}
                      onClick={() => toggleUser(friend._id)}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-all duration-150 text-left",
                        isSelected
                          ? "bg-primary/[0.08] hover:bg-primary/[0.12]"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          type="chat"
                          name={friend.displayName}
                          avatarUrl={friend.avatarUrl || undefined}
                          className="size-8"
                          previewable={false}
                        />
                        <span className={cn("text-[13.5px] font-medium leading-none", isSelected && "text-primary")}>{friend.displayName}</span>
                      </div>
                      <div className={cn(
                        "size-5 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-150",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground forward-select-pop"
                          : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="size-3" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {filteredGroups.length > 0 && (
            <div>
              <h3 className="px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Groups</h3>
              <div className="space-y-px">
                {filteredGroups.map((groupConv) => {
                  const isSelected = selectedGroupIds.includes(groupConv._id);
                  return (
                    <button
                      type="button"
                      key={groupConv._id}
                      onClick={() => toggleGroup(groupConv._id)}
                      className={cn(
                        "w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-all duration-150 text-left",
                        isSelected
                          ? "bg-primary/[0.08] hover:bg-primary/[0.12]"
                          : "hover:bg-muted/60"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <GroupChatAvatar
                          participants={groupConv.participants}
                          type="chat"
                        />
                        <span className={cn("text-[13.5px] font-medium leading-none", isSelected && "text-primary")}>{groupConv.group.name}</span>
                      </div>
                      <div className={cn(
                        "size-5 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-150",
                        isSelected
                          ? "bg-primary border-primary text-primary-foreground forward-select-pop"
                          : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="size-3" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-border/25 bg-muted/5 flex justify-between items-center">
          <span className="text-[12px] font-medium text-muted-foreground/70 pl-0.5">
            {totalSelected > 0 ? (
              <span className="text-primary font-semibold">{totalSelected}</span>
            ) : null }
            {totalSelected > 0 ? ` selected` : "No one selected"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="rounded-full px-3 text-[12.5px] h-8"
            >
              Cancel
            </Button>
            <Button
              onClick={handleForward}
              disabled={totalSelected === 0 || isForwarding}
              size="sm"
              className="rounded-full px-4 h-8 text-[12.5px] font-semibold bg-primary text-primary-foreground hover:brightness-110 shadow-sm hover:shadow-md transition-all active:scale-[0.97] disabled:opacity-50"
            >
              <SendHorizontal className="size-3.5 mr-1.5" />
              {isForwarding ? "Sending..." : "Forward"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
