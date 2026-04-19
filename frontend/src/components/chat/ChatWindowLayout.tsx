import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import { SidebarInset } from "../ui/sidebar";
import ChatWindowHeader from "./ChatWindowHeader";
import ChatWindowBody from "./ChatWindowBody";
import MessageInput from "./MessageInput";
import { useEffect, useState } from "react";
import ChatWindowSkeleton from "../skeleton/ChatWindowSkeleton";
import { useSocketStore } from "@/stores/useSocketStore";
import { RefreshCw, WifiOff } from "lucide-react";

const RETRY_REALTIME_TIMEOUT_MS = 7000;

const ChatWindowLayout = () => {
  const {
    activeConversationId,
    conversations,
    messages,
    messageLoading: loading,
    markAsSeen,
    setGroupActiveChannel,
  } = useChatStore();
  const { socket, connectSocket } = useSocketStore();
  const [retryingRealtime, setRetryingRealtime] = useState(false);

  const selectedConvo =
    conversations.find(
      (c) => String(c._id) === String(activeConversationId || ""),
    ) ?? null;
  const showRealtimeStatusBanner = Boolean(socket && !socket.connected);
  const isRealtimeReconnecting = Boolean(
    socket && socket.active && !socket.connected,
  );

  useEffect(() => {
    if (socket?.connected) {
      setRetryingRealtime(false);
    }
  }, [socket?.connected]);

  useEffect(() => {
    if (!showRealtimeStatusBanner) {
      setRetryingRealtime(false);
    }
  }, [showRealtimeStatusBanner]);

  useEffect(() => {
    if (!retryingRealtime) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setRetryingRealtime(false);
    }, RETRY_REALTIME_TIMEOUT_MS);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [retryingRealtime]);

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

  const handleRetryRealtime = () => {
    if (retryingRealtime) {
      return;
    }

    setRetryingRealtime(true);
    connectSocket();
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

      {showRealtimeStatusBanner && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-300/45 bg-amber-100/70 px-3 py-1.5 text-[11px] font-medium text-amber-900/85">
          <div className="flex min-w-0 items-center gap-2">
          <WifiOff className="size-3.5" />
          <span>
            {isRealtimeReconnecting
              ? "Reconnecting to live chat. New messages will sync automatically."
              : "Live chat is offline. We'll sync updates once your connection is back."}
          </span>
          </div>

          {!isRealtimeReconnecting && (
            <button
              type="button"
              onClick={handleRetryRealtime}
              disabled={retryingRealtime}
              className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50/70 px-2.5 py-1 text-[10.5px] font-semibold text-amber-900 transition-[background-color,color,border-color] hover:bg-amber-200/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className={retryingRealtime ? "size-3 animate-spin" : "size-3"} />
              {retryingRealtime ? "Retrying..." : "Retry"}
            </button>
          )}
        </div>
      )}

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
