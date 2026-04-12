import { useEffect, useMemo, useRef } from "react";
import {
  ExternalLink,
  ImagePlus,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Pin,
  PinOff,
  SendHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/chat/UserAvatar";
import { chatService } from "@/services/chatService";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useMiniChatDockStore } from "@/stores/useMiniChatDockStore";
import { useSocketStore } from "@/stores/useSocketStore";
import MiniChatSkeleton from "@/components/skeleton/MiniChatSkeleton";
import { cn } from "@/lib/utils";

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const findDirectConversationId = (
  userId: string,
  conversations: ReturnType<typeof useChatStore.getState>["conversations"],
) => {
  return (
    conversations.find(
      (conversationItem) =>
        conversationItem.type === "direct" &&
        conversationItem.participants.some((participant) => String(participant._id) === String(userId)),
    )?._id || null
  );
};

const MAX_FILE_SIZE_MB = 5;

const MiniChatWindow = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const windowItem = useMiniChatDockStore((state) =>
    state.windows.find((candidate) => candidate.userId === userId),
  );
  const closeWindow = useMiniChatDockStore((state) => state.closeWindow);
  const toggleMinimized = useMiniChatDockStore((state) => state.toggleMinimized);
  const togglePinned = useMiniChatDockStore((state) => state.togglePinned);
  const togglePoppedOut = useMiniChatDockStore((state) => state.togglePoppedOut);
  const setConversationId = useMiniChatDockStore((state) => state.setConversationId);
  const setDraft = useMiniChatDockStore((state) => state.setDraft);
  const setImagePreview = useMiniChatDockStore((state) => state.setImagePreview);
  const setUnread = useMiniChatDockStore((state) => state.setUnread);
  const clearUnread = useMiniChatDockStore((state) => state.clearUnread);
  const setPoppedHeight = useMiniChatDockStore((state) => state.setPoppedHeight);

  const {
    conversations,
    messages,
    fetchMessages,
    sendDirectMessage,
    addConvo,
    updateConversation,
    setActiveConversation,
  } = useChatStore();
  const { socket, getUserPresence } = useSocketStore();
  const currentUserId = useAuthStore((state) => state.user?._id || "");

  const resolvingRef = useRef(false);
  const loadedConversationRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);

  const conversationId = windowItem?.conversationId || null;
  const currentMessages = useMemo(
    () => (conversationId ? messages[conversationId]?.items || [] : []),
    [conversationId, messages],
  );

  const currentConversation = useMemo(
    () => conversations.find((conversationItem) => conversationItem._id === conversationId) || null,
    [conversations, conversationId],
  );

  const unreadCount = currentConversation?.unreadCounts?.[currentUserId] || 0;

  useEffect(() => {
    if (!windowItem) {
      return;
    }

    const existingConversationId = findDirectConversationId(windowItem.userId, conversations);
    if (existingConversationId) {
      if (windowItem.conversationId !== existingConversationId) {
        setConversationId(windowItem.userId, existingConversationId);
      }
      return;
    }

    if (windowItem.conversationId || resolvingRef.current) {
      return;
    }

    resolvingRef.current = true;

    const resolveConversation = async () => {
      try {
        const createdConversation = await chatService.createConversation("direct", "", [windowItem.userId]);
        if (!createdConversation?._id) {
          return;
        }

        addConvo(createdConversation, { setActive: false });
        setConversationId(windowItem.userId, createdConversation._id);

        if (socket?.connected) {
          socket.emit("join-conversation", createdConversation._id);
        }
      } catch (error) {
        console.error("Failed to initialize mini chat conversation", error);
      } finally {
        resolvingRef.current = false;
      }
    };

    void resolveConversation();
  }, [
    addConvo,
    conversations,
    setConversationId,
    socket,
    windowItem,
  ]);

  useEffect(() => {
    if (!windowItem) {
      return;
    }

    if ((windowItem.unreadCount || 0) === unreadCount) {
      return;
    }

    setUnread(windowItem.userId, unreadCount);
  }, [setUnread, unreadCount, windowItem]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const hasMessages = Boolean(messages[conversationId]?.items?.length);
    if (hasMessages || loadedConversationRef.current === conversationId) {
      return;
    }

    loadedConversationRef.current = conversationId;
    void fetchMessages(conversationId);
  }, [conversationId, fetchMessages, messages]);

  useEffect(() => {
    if (!windowItem || !conversationId || windowItem.minimized || unreadCount <= 0) {
      return;
    }

    clearUnread(windowItem.userId);
    updateConversation({
      _id: conversationId,
      unreadCounts: {
        ...currentConversation?.unreadCounts,
        [currentUserId]: 0,
      },
    });

    void chatService.markAsSeen(conversationId).catch((error) => {
      console.error("Failed to mark mini chat messages as seen", error);
    });
  }, [
    clearUnread,
    conversationId,
    currentConversation?.unreadCounts,
    currentUserId,
    unreadCount,
    updateConversation,
    windowItem,
  ]);

  useEffect(() => {
    if (!windowItem || windowItem.minimized) {
      return;
    }

    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [currentMessages.length, windowItem]);

  if (!windowItem) {
    return null;
  }

  const presence = getUserPresence(windowItem.userId);
  let presenceLabel = "Offline";
  if (presence === "online") {
    presenceLabel = "Active now";
  } else if (presence === "recently-active") {
    presenceLabel = "Recently active";
  }

  const handleSend = async () => {
    // Read directly from the store to guarantee we don't accidentally double-send
    // if React hasn't flushed the closure state yet.
    const currentWindow = useMiniChatDockStore.getState().windows.find((w) => w.userId === userId);
    if (!currentWindow) return;

    const content = currentWindow.draft.trim();
    if (!content && !currentWindow.imagePreview) {
      return;
    }

    // Immediately clear the state in the store so synchronous events reading next will get ""
    setDraft(userId, "");
    const imgUrl = currentWindow.imagePreview || undefined;
    setImagePreview(userId, null);

    await sendDirectMessage(userId, content, imgUrl, conversationId || undefined);
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        return;
      }

      setImagePreview(windowItem.userId, reader.result);
    };
    reader.readAsDataURL(file);
  };

  const shouldPulse = windowItem.pulseUntil > Date.now();

  const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!windowItem.poppedOut) {
      return;
    }

    resizeStartYRef.current = event.clientY;
    resizeStartHeightRef.current = windowItem.poppedHeight || 500;

    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - resizeStartYRef.current;
      setPoppedHeight(windowItem.userId, resizeStartHeightRef.current + delta);
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <section
      className={cn(
        "social-mini-chat-window mini-chat-bounce-in",
        windowItem.poppedOut ? "social-mini-chat-window--popped" : "",
        windowItem.minimized && windowItem.unreadCount > 0 ? "mini-chat-flash-unread" : ""
      )}
      aria-label={`Chat with ${windowItem.displayName}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", windowItem.userId);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
      }}
    >
      <header className={`social-mini-chat-head mini-chat-glass-head ${shouldPulse ? "social-mini-chat-head--pulse" : ""}`}>
        <button
          type="button"
          className="social-mini-chat-user"
          onClick={() => toggleMinimized(windowItem.userId)}
        >
          {/* Avatar with online indicator */}
          <div className="relative flex-shrink-0">
            <UserAvatar
              type="chat"
              name={windowItem.displayName}
              avatarUrl={windowItem.avatarUrl}
              className="social-mini-chat-avatar"
            />
            <span
              className="absolute bottom-0 right-0 block size-2.5 rounded-full ring-2 ring-white dark:ring-background"
              style={{
                background: presenceLabel === "Online"
                  ? "hsl(145 53% 50%)"
                  : "hsl(var(--se-muted))",
              }}
            />
          </div>
          <span className="social-mini-chat-identity">
            <span className="social-mini-chat-name">
              {windowItem.displayName}
              {windowItem.unreadCount > 0 ? (
                <span className="social-mini-chat-unread-badge">{windowItem.unreadCount}</span>
              ) : null}
            </span>
            <span className="social-mini-chat-presence">{presenceLabel}</span>
          </span>
        </button>

        <div className="social-mini-chat-actions">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="social-mini-chat-icon-btn"
            onClick={() => togglePinned(windowItem.userId)}
            title={windowItem.pinned ? "Unpin" : "Pin"}
          >
            {windowItem.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="social-mini-chat-icon-btn"
            onClick={() => togglePoppedOut(windowItem.userId)}
            title={windowItem.poppedOut ? "Dock compact" : "Pop out"}
          >
            {windowItem.poppedOut ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="social-mini-chat-icon-btn"
            onClick={() => {
              if (conversationId) {
                setActiveConversation(conversationId);
              }
              navigate("/");
            }}
            title="Open full chat"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="social-mini-chat-icon-btn"
            onClick={() => toggleMinimized(windowItem.userId)}
            title={windowItem.minimized ? "Expand" : "Minimize"}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="social-mini-chat-icon-btn"
            onClick={() => closeWindow(windowItem.userId)}
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {!windowItem.minimized ? (
        <>
          <div
            ref={listRef}
            className="social-mini-chat-messages beautiful-scrollbar"
            style={
              windowItem.poppedOut
                ? { height: `${Math.max((windowItem.poppedHeight || 500) - 150, 240)}px` }
                : undefined
            }
          >
            {!conversationId ? (
              <div className="flex-1 flex flex-col justify-end w-full overflow-hidden pb-1">
                <MiniChatSkeleton />
              </div>
            ) : currentMessages.length ? (
              currentMessages.slice(-18).map((messageItem) => {
                const ownMessage =
                  messageItem.isOwn ?? String(messageItem.senderId) === String(currentUserId);

                return (
                  <article
                    key={messageItem._id}
                    className={`social-mini-chat-msg ${ownMessage ? "social-mini-chat-msg--own" : ""}`}
                  >
                    <div className={`social-mini-chat-bubble ${ownMessage ? "animate-in fade-in slide-in-from-bottom-1 duration-200" : "animate-in fade-in slide-in-from-left-1 duration-200"}`}>
                      {messageItem.content || (messageItem.imgUrl ? "" : "(Attachment)")}
                      {messageItem.imgUrl ? (
                        <img
                          src={messageItem.imgUrl}
                          alt="Message media"
                          className="social-mini-chat-media"
                        />
                      ) : null}
                    </div>
                    <span className="social-mini-chat-time">{formatMessageTime(messageItem.createdAt)}</span>
                  </article>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center gap-2.5 text-center my-auto py-6 px-3">
                <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary/8">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="absolute inset-0 rounded-full border border-primary/20 animate-ping opacity-30" />
                </div>
                <p className="social-mini-chat-state text-[13px] font-medium">
                  Say hi to {windowItem.displayName.split(" ")[0]}! 👋
                </p>
              </div>
            )}
          </div>

          <div className="social-mini-chat-input-row">
            {/* Pill: Attach + (image preview if any) + Textarea */}
            <div className="social-mini-chat-input-pill">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="social-mini-chat-attach"
                onClick={() => fileInputRef.current?.click()}
                title="Attach image"
              >
                <ImagePlus className="h-[15px] w-[15px]" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              <div className="flex flex-col flex-1 min-w-0">
                {windowItem.imagePreview ? (
                  <div className="social-mini-chat-image-preview">
                    <img src={windowItem.imagePreview} alt="Selected" className="social-mini-chat-preview-image" />
                    <button
                      type="button"
                      className="social-mini-chat-preview-remove"
                      onClick={() => setImagePreview(windowItem.userId, null)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : null}
                <textarea
                  value={windowItem.draft}
                  placeholder="Write a message..."
                  onChange={(event) => setDraft(windowItem.userId, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  className="social-mini-chat-input"
                  rows={1}
                />
              </div>
            </div>

            {/* Circular send button outside pill */}
            <Button
              type="button"
              size="icon"
              className="social-mini-chat-send"
              disabled={!windowItem.draft.trim() && !windowItem.imagePreview}
              onClick={() => void handleSend()}
              title="Send"
            >
              <SendHorizontal className="h-[15px] w-[15px]" />
            </Button>
          </div>

          {windowItem.poppedOut ? (
            <button
              type="button"
              className="social-mini-chat-resize-handle"
              aria-label="Resize pop-out chat window"
              onPointerDown={startResize}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
};

const SocialMiniChatDock = () => {
  const windows = useMiniChatDockStore((state) => state.windows);
  const minimizeAll = useMiniChatDockStore((state) => state.minimizeAll);
  const reorderWindows = useMiniChatDockStore((state) => state.reorderWindows);
  const totalUnread = useMemo(
    () => windows.reduce((sum, windowItem) => sum + (windowItem.unreadCount || 0), 0),
    [windows],
  );

  if (!windows.length) {
    return null;
  }

  return (
    <div className="social-mini-chat-dock-wrap" aria-label="Mini chat dock">
      <div className="social-mini-chat-dock-utility">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="social-mini-chat-overview"
          onClick={minimizeAll}
        >
          <MessageCircle className="h-4 w-4" />
          Chats ({windows.length})
          {totalUnread > 0 ? (
            <span className="social-mini-chat-overview-unread">{totalUnread}</span>
          ) : null}
        </Button>
      </div>

      <div className="social-mini-chat-dock">
        {windows.map((windowItem) => (
          <div
            key={windowItem.userId}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const draggedUserId = event.dataTransfer.getData("text/plain");
              reorderWindows(draggedUserId, windowItem.userId);
            }}
          >
            <MiniChatWindow userId={windowItem.userId} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SocialMiniChatDock;
