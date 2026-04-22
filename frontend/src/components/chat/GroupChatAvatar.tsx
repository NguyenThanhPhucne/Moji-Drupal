import type { Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";

interface GroupChatAvatarProps {
  participants: Participant[];
  type: "chat" | "sidebar";
}

const GroupChatAvatar = ({ participants, type }: GroupChatAvatarProps) => {
  const avatars = [];
  // In sidebar stacked layout, cap at 3 avatars to avoid overflow
  const limit = type === "sidebar" ? Math.min(participants.length, 3) : Math.min(participants.length, 4);
  // Sidebar stacks use the 'chat' (size-8/32px) size so they don't overflow the card
  const avatarType = type === "sidebar" ? "chat" : "chat";

  for (let i = 0; i < limit; i++) {
    const member = participants[i];
    avatars.push(
      <UserAvatar
        key={i}
        type={avatarType}
        name={member.displayName}
        avatarUrl={member.avatarUrl ?? undefined}
      />,
    );
  }

  return (
    <div
      className={cn(
        "relative flex",
        type === "sidebar" ? "-space-x-2.5" : "-space-x-1.5",
        "*:data-[slot=avatar]:ring-background *:data-[slot=avatar]:ring-[1.5px]",
      )}
    >
      {avatars}

      {/* if there are more than limit avatars, render overflow indicator */}
      {participants.length > limit && (
        <div
          className={cn(
            "flex items-center z-10 justify-center rounded-full bg-primary/10 ring-[1.5px] ring-background text-primary font-bold transition-colors",
            type === "sidebar" ? "size-8 text-xs" : "size-8 text-xs"
          )}
        >
          +{participants.length - limit}
        </div>
      )}
    </div>
  );
};

export default GroupChatAvatar;
