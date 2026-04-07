import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import { useEffect } from "react";
import ChatWindowSkeleton from "../skeleton/ChatWindowSkeleton";

const ChatWindowLayout = () => {
  const {
    activeConversationId,
    conversations,
    messages,
    messageLoading: loading,
    markAsSeen,
  } = useChatStore();

  const selectedConvo =
    conversations.find((c) => c._id === activeConversationId) ?? null;
  const hasLoadedMessages = selectedConvo
    ? (messages[selectedConvo._id]?.items?.length ?? 0) > 0
    : false;

  useEffect(() => {
    if (!selectedConvo) {
      return;
    }

    const markSeen = async () => {
      try {
        await markAsSeen();
      } catch (error) {
        console.error("Error while marking messages as seen", error);
      }
    };

    markSeen();
  }, [selectedConvo, markAsSeen]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  return (
    <SidebarInset className="app-shell-panel glass-strong flex h-full min-h-0 flex-1 md:border md:border-border/80 md:rounded-2xl overflow-hidden shadow-soft">
      {/* Header */}
      <div
        key={`chat-header-${selectedConvo._id}`}
        className="conversation-fade"
      >
        <ChatWindowHeader chat={selectedConvo} />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 bg-background">
        <div
          key={`chat-body-${selectedConvo._id}`}
          className="h-full conversation-fade"
        >
          {loading && !hasLoadedMessages ? (
            <ChatWindowSkeleton />
          ) : (
            <ChatWindowBody />
          )}
        </div>
      </div>

      {/* Footer */}
      <MessageInput selectedConvo={selectedConvo} />
    </SidebarInset>
  );
};

export default ChatWindowLayout;
