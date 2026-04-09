import type { Participant } from "@/types/chat";
import UserAvatar from "./UserAvatar";
import { cn } from "@/lib/utils";

interface GroupChatAvatarProps {
  participants: Participant[];
  type: "chat" | "sidebar";
}

const GroupChatAvatar = ({ participants, type }: GroupChatAvatarProps) => {
  const avatars = [];
  const limit = Math.min(participants.length, 4);

  for (let i = 0; i < limit; i++) {
    const member = participants[i];
    avatars.push(
      <UserAvatar
        key={i}
        type={type}
        name={member.displayName}
        avatarUrl={member.avatarUrl ?? undefined}
      />,
    );
  }

  return (
    <div className="relative flex -space-x-1.5 *:data-[slot=avatar]:ring-background *:data-[slot=avatar]:ring-[1.5px] hover:-space-x-1 transition-all duration-200">
      {avatars}

      {/* if there are more than 4 avatars, render overflow indicator */}
      {participants.length > limit && (
        <div 
          className={cn(
            "flex items-center z-10 justify-center rounded-full bg-primary/10 ring-[1.5px] ring-background text-primary font-bold transition-all",
            type === "sidebar" ? "size-[42px] text-sm" : "size-8 text-xs"
          )}
        >
          +{participants.length - limit}
        </div>
      )}
    </div>
  );
};

export default GroupChatAvatar;
