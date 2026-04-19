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
    setGroupActiveChannel,
  } = useChatStore();

  const selectedConvo =
    conversations.find(
      (c) => String(c._id) === String(activeConversationId || ""),
    ) ?? null;
  const hasLoadedMessages = selectedConvo
    ? (messages[selectedConvo._id]?.items?.length ?? 0) > 0
    : false;
  const activeSeenChannelSegment =
    selectedConvo?.type === "group"
      ? String(selectedConvo.group?.activeChannelId || "general")
      : "direct";
  const activeSeenKey = selectedConvo
    ? `${String(selectedConvo._id)}:${activeSeenChannelSegment}`
    : null;
  const layoutGroupChannels =
    selectedConvo?.type === "group"
      ? (selectedConvo.group?.channels || []).map((channel) => ({
          channelId: String(channel.channelId || ""),
          name: String(channel.name || channel.channelId || "general"),
        }))
      : [];
  const layoutActiveGroupChannelId =
    selectedConvo?.type === "group"
      ? String(
          selectedConvo.group?.activeChannelId ||
            layoutGroupChannels[0]?.channelId ||
            "general",
        )
      : "";

  const handleLayoutGroupChannelSwitch = (channelId: string) => {
    if (selectedConvo?.type !== "group") {
      return;
    }

    setGroupActiveChannel(String(selectedConvo._id), String(channelId)).catch(
      (error) => {
        console.error("Error switching group channel from layout:", error);
      },
    );
  };

  const handleLayoutGroupChannelCycle = (direction: "next" | "prev") => {
    if (layoutGroupChannels.length === 0) {
      return;
    }

    const currentIndex = layoutGroupChannels.findIndex(
      (channel) => channel.channelId === layoutActiveGroupChannelId,
    );
    const safeCurrentIndex = Math.max(0, currentIndex);
    const delta = direction === "next" ? 1 : -1;
    const nextIndex =
      (safeCurrentIndex + delta + layoutGroupChannels.length) %
      layoutGroupChannels.length;

    const nextChannelId = layoutGroupChannels[nextIndex]?.channelId;
    if (!nextChannelId || nextChannelId === layoutActiveGroupChannelId) {
      return;
    }

    handleLayoutGroupChannelSwitch(nextChannelId);
  };

  useEffect(() => {
    if (!activeSeenKey) {
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
  }, [activeSeenKey, markAsSeen]);

  if (!selectedConvo) {
    return <ChatWelcomeScreen />;
  }

  return (
    <SidebarInset className="app-shell-panel chat-main-shell glass-strong flex h-full min-h-0 flex-1 overflow-hidden shadow-soft md:rounded-2xl md:border md:border-border/80">
      {/* Header */}
      <div
        key={`chat-header-${selectedConvo._id}`}
        className="conversation-fade"
      >
        <ChatWindowHeader chat={selectedConvo} />
      </div>

      {selectedConvo.type === "group" && layoutGroupChannels.length > 0 && (
        <div className="chat-channel-rail hidden items-center gap-2 border-b border-border/70 bg-background px-3 py-2 md:flex">
          <span className="text-[11px] font-semibold text-muted-foreground/70">
            Channel
          </span>
          <select
            data-testid="group-channel-switcher"
            value={layoutActiveGroupChannelId}
            onChange={(event) => {
              handleLayoutGroupChannelSwitch(event.target.value);
            }}
            onKeyDown={(event) => {
              const isPrevShortcut = event.altKey && event.key === "ArrowUp";
              const isNextShortcut = event.altKey && event.key === "ArrowDown";

              if (!isPrevShortcut && !isNextShortcut) {
                return;
              }

              event.preventDefault();
              handleLayoutGroupChannelCycle(isNextShortcut ? "next" : "prev");
            }}
            aria-label="Switch active group channel"
            className="chat-channel-select h-8 min-w-[130px] rounded-full border border-border/70 bg-background px-3 text-[11px] font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/35"
          >
            {layoutGroupChannels.map((channel) => (
              <option key={channel.channelId} value={channel.channelId}>
                #{channel.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Body */}
      <div className="chat-body-shell chat-body-shell--command flex-1 min-h-0 bg-background">
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
      <div className="chat-footer-shell chat-footer-shell--command">
        <MessageInput selectedConvo={selectedConvo} />
      </div>
    </SidebarInset>
  );
};

export default ChatWindowLayout;
