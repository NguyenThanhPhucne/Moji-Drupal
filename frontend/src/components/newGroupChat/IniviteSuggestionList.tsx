import type { Friend } from "@/types/user";
import UserAvatar from "../chat/UserAvatar";

interface InviteSuggestionListProps {
  filteredFriends: Friend[];
  onSelect: (friend: Friend) => void;
}

const IniviteSuggestionList = ({
  filteredFriends,
  onSelect,
}: InviteSuggestionListProps) => {
  if (filteredFriends.length === 0) {
    return;
  }

  return (
    <div className="border rounded-lg mt-2 max-h-[180px] overflow-y-auto divide-y">
      {filteredFriends.map((friend) => (
        <button
          type="button"
          key={friend._id}
          className="w-full flex items-center gap-3 p-2 text-left hover:bg-muted/70 transition"
          onClick={() => onSelect(friend)}
        >
          <UserAvatar
            type="chat"
            name={friend.displayName || friend.username}
            avatarUrl={friend.avatarUrl}
          />

          <span className="font-medium">
            {friend.displayName || friend.username}
          </span>
        </button>
      ))}
    </div>
  );
};

export default IniviteSuggestionList;
