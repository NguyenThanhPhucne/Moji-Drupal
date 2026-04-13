import { Button } from "@/components/ui/button";
import { LoaderCircle, MessageCircle, Trash2 } from "lucide-react";
import FriendProfileMiniCard from "./FriendProfileMiniCard";
import UserAvatar from "./UserAvatar";
import type { Friend } from "@/types/user";

interface FriendListItemProps {
  friend: Friend;
  disabled?: boolean;
  busyAction?: "chat" | "remove" | null;
  onChat?: (friendId: string) => void;
  onRemove?: (friendId: string, displayName: string) => void;
  onViewProfile?: (friendId: string) => void;
  customActions?: React.ReactNode;
}

// NOSONAR
export const FriendListItem = ({ 
  friend, 
  disabled = false, 
  busyAction = null,
  onChat, 
  onRemove, 
  onViewProfile,
  customActions 
}: FriendListItemProps) => {
  const defaultActions = (
    <>
      {onChat && (
        <Button
          type="button"
          className="size-9 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white shadow-sm hover:shadow active:scale-95 transition-all"
          size="icon"
          onClick={() => onChat(friend._id)}
          disabled={disabled}
          title="Message"
        >
          {busyAction === "chat" ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <MessageCircle className="size-4 relative top-px right-px" />
          )}
        </Button>
      )}
      {onRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all"
          onClick={() => onRemove(friend._id, friend.displayName)}
          disabled={disabled}
          title="Remove Friend"
        >
          {busyAction === "remove" ? (
            <LoaderCircle className="size-[15px] animate-spin" />
          ) : (
            <Trash2 className="size-[15px]" />
          )}
        </Button>
      )}
    </>
  );

  return (
    <div className="enterprise-list-item group">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <FriendProfileMiniCard
          userId={friend._id}
          displayName={friend.displayName}
          avatarUrl={friend.avatarUrl}
          onViewProfile={onViewProfile ? () => onViewProfile(friend._id) : undefined}
          onChat={onChat ? () => onChat(friend._id) : undefined}
          onRemove={onRemove ? () => onRemove(friend._id, friend.displayName) : undefined}
          disabled={disabled}
        >
          <div className="cursor-pointer group-hover:scale-105 group-hover:shadow-md transition-all duration-300 rounded-full">
            <UserAvatar
              type="sidebar"
              name={friend.displayName}
              avatarUrl={friend.avatarUrl}
            />
          </div>
        </FriendProfileMiniCard>

        <div className="min-w-0 flex-1 cursor-pointer">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground/90 group-hover:text-primary transition-colors">
            {friend.displayName}
          </p>
          <p className="truncate text-[12.5px] font-medium text-muted-foreground/80">
            @{friend.username}
          </p>
        </div>
      </div>

      <div className="group-focus-within:opacity-100 enterprise-action-reveal gap-2">
        {customActions ?? defaultActions}
      </div>
    </div>
  );
};
