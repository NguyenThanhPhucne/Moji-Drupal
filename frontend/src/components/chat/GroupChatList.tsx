import { useChatStore } from "@/stores/useChatStore";
import GroupChatCard from "./GroupChatCard";

const GroupChatList = () => {
  const { conversations } = useChatStore();

  if (!conversations || conversations.length === 0) return null;

  const groupchats = conversations.filter((convo) => convo.type === "group");

  if (groupchats.length === 0) {
    return (
      <div className="p-2 text-center text-sm text-muted-foreground">
        Không có nhóm chat
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2">
      {groupchats.map((convo) => (
        <GroupChatCard convo={convo} key={convo._id} />
      ))}
    </div>
  );
};

export default GroupChatList;
