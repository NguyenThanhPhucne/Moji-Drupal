import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import { useEffect } from "react";
import { Skeleton } from "../ui/skeleton";

const ChatWindowLayout = () => {
  const {
    activeConversationId,
    conversations,
    messageLoading: loading,
    markAsSeen,
  } = useChatStore();

  const selectedConvo =
    conversations.find((c) => c._id === activeConversationId) ?? null;

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
  }, [selectedConvo?._id]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  return (
    <SidebarInset className="app-shell-panel glass-strong flex h-full min-h-0 flex-1">
      {/* Header */}
      <div
        key={`chat-header-${selectedConvo._id}`}
        className="animate-in fade-in-0 duration-200"
      >
        <ChatWindowHeader chat={selectedConvo} />
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 bg-primary-foreground/80">
        <div
          key={`chat-body-${selectedConvo._id}-${loading ? "loading" : "ready"}`}
          className="h-full animate-in fade-in-0 duration-200"
        >
          {loading ? (
            <div className="h-full w-full px-4 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-6 w-40 rounded-xl" />
              </div>
              <Skeleton className="h-14 w-2/3 rounded-2xl" />
              <Skeleton className="h-14 w-1/2 rounded-2xl ml-auto" />
              <Skeleton className="h-14 w-3/4 rounded-2xl" />
              <Skeleton className="h-14 w-1/3 rounded-2xl ml-auto" />
            </div>
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
