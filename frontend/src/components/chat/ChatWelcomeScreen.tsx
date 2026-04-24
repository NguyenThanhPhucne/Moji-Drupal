import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import {
  Clock3,
  MessageSquareDashed,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useMemo, useState } from "react";
import NewGroupChatModal from "./NewGroupChatModal";
import { Dialog } from "../ui/dialog";
import { useFriendStore } from "@/stores/useFriendStore";
import FriendListModal from "../createNewChat/FriendListModal";

const toConversationTimestamp = (conversation: {
  lastMessage?: { createdAt?: string } | null;
  updatedAt?: string;
  createdAt?: string;
}) => {
  const candidate =
    conversation.lastMessage?.createdAt ||
    conversation.updatedAt ||
    conversation.createdAt ||
    "";

  const ts = Date.parse(String(candidate));
  return Number.isFinite(ts) ? ts : 0;
};

const ChatWelcomeScreen = () => {
  const conversations = useChatStore((state) => state.conversations);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const fetchMessages = useChatStore((state) => state.fetchMessages);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDirect, setShowNewDirect] = useState(false);
  const { getFriends } = useFriendStore();

  const recentConversations = useMemo(
    () =>
      [...conversations]
        .sort(
          (left, right) =>
            toConversationTimestamp(right) - toConversationTimestamp(left),
        )
        .slice(0, 4),
    [conversations],
  );
  const latestConversation = recentConversations[0] ?? null;

  const handleOpenNewDirectChat = async () => {
    await getFriends();
    setShowNewDirect(true);
  };

  const handleOpenConversation = async (conversationId: string) => {
    const normalizedConversationId = String(conversationId || "").trim();
    if (!normalizedConversationId) {
      return;
    }

    setActiveConversation(normalizedConversationId);
    await fetchMessages(normalizedConversationId);
  };

  const handleResumeLatestConversation = async () => {
    if (!latestConversation?._id) {
      return;
    }

    await handleOpenConversation(String(latestConversation._id));
  };

  return (
    <SidebarInset className="chat-shell-panel">
      <ChatWindowHeader />

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-4 sm:px-6 lg:px-8">
        {/* Subtle ambient gradients */}
        <div className="pointer-events-none absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-primary/[0.02] blur-[100px]" />

        <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center animate-in fade-in zoom-in-95 duration-700">
          {/* Central Icon */}
          <div className="relative mb-8 flex size-20 items-center justify-center rounded-3xl bg-gradient-to-b from-primary/10 to-primary/5 shadow-inner ring-1 ring-primary/10">
            <MessageSquareDashed className="size-8 text-primary/80" strokeWidth={1.5} />
            <div className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border/50">
              <Zap className="size-4 text-primary" strokeWidth={2} />
            </div>
          </div>

          {/* Typography */}
          <h1 className="mb-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Welcome to Messages
          </h1>
          <p className="mb-10 text-[14px] leading-relaxed text-muted-foreground/80 max-w-[32ch]">
            Select a conversation from the sidebar to start chatting, or create a new one.
          </p>

          {/* Actions */}
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-[240px]">
            {latestConversation && (
              <button
                type="button"
                onClick={handleResumeLatestConversation}
                className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/95 hover:shadow-lg active:scale-[0.98]"
              >
                <Clock3 className="size-4 transition-transform group-hover:-rotate-12" />
                Resume Latest Chat
              </button>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleOpenNewDirectChat}
                className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 hover:text-foreground active:scale-[0.98]"
              >
                <Plus className="size-4 text-muted-foreground" />
                Direct
              </button>
              
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 hover:text-foreground active:scale-[0.98]"
              >
                <Users className="size-4 text-muted-foreground" />
                Group
              </button>
            </div>
          </div>

          {/* Contextual Stats */}
          {conversations.length > 0 && (
            <p className="mt-10 text-[12px] font-medium text-muted-foreground/50">
              {conversations.length} active {conversations.length === 1 ? "conversation" : "conversations"}
            </p>
          )}
        </div>
      </div>

      {/* New Direct Chat Modal */}
      <Dialog open={showNewDirect} onOpenChange={setShowNewDirect}>
        <FriendListModal />
      </Dialog>

      {/* New Group Modal */}
      <NewGroupChatModal
        isOpen={showNewGroup}
        onClose={() => setShowNewGroup(false)}
      />
    </SidebarInset>
  );
};

export default ChatWelcomeScreen;

