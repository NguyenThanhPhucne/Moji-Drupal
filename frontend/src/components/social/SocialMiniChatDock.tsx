import { useEffect, useMemo, useRef } from "react";
import {
  AlertCircle,
  Clock3,
  ExternalLink,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Pin,
  PinOff,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/chat/UserAvatar";
import { chatService } from "@/services/chatService";
import type { Message } from "@/types/chat";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatStore } from "@/stores/useChatStore";
import { useMiniChatDockStore, type MiniChatDockWindow } from "@/stores/useMiniChatDockStore";
import { useSocketStore } from "@/stores/useSocketStore";
import MiniChatSkeleton from "@/components/skeleton/MiniChatSkeleton";
import { cn } from "@/lib/utils";

const MINI_CHAT_KEYBOARD_SHORTCUTS = {
  focusNext: "Alt+→",
  focusPrevious: "Alt+←",
  closeFocused: "Alt+⌫",
  minimizeAll: "Alt+M",
} as const;

const isMiniChatShortcut = (event: KeyboardEvent) => {
  if (!event.altKey) {
    return null;
  }

  if (event.key === "ArrowRight") {
    return "focusNext";
  }

  if (event.key === "ArrowLeft") {
    return "focusPrevious";
  }

  if (event.key === "Backspace") {
    return "closeFocused";
  }

  if (event.key === "m" || event.key === "M") {
    return "minimizeAll";
  }

  return null;
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getMiniChatDeliveryLabel = (message: Message) => {
  if (message.deliveryState === "sending") {
    return "Sending";
  }

  if (message.deliveryState === "queued") {
    return "Queued";
  }

  if (message.deliveryState === "failed") {
    return "Failed";
  }

  return "";
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

type ChatStoreSnapshot = ReturnType<typeof useChatStore.getState>;
type MiniChatDockStoreSnapshot = ReturnType<typeof useMiniChatDockStore.getState>;

type UseMiniChatConversationSyncParams = {
  windowItem?: MiniChatDockWindow;
  conversations: ChatStoreSnapshot["conversations"];
  messages: ChatStoreSnapshot["messages"];
  currentUserId: string;
  addConvo: ChatStoreSnapshot["addConvo"];
  setConversationId: MiniChatDockStoreSnapshot["setConversationId"];
  socket: ReturnType<typeof useSocketStore.getState>["socket"];
  setUnread: MiniChatDockStoreSnapshot["setUnread"];
  fetchMessages: ChatStoreSnapshot["fetchMessages"];
  clearUnread: MiniChatDockStoreSnapshot["clearUnread"];
  updateConversation: ChatStoreSnapshot["updateConversation"];
};

const getPresenceLabel = (presence?: string) => {
  if (presence === "online") {
    return "Active now";
  }

  if (presence === "recently-active") {
    return "Recently active";
  }

  return "Offline";
};

const useMiniChatConversationSync = ({
  windowItem,
  conversations,
  messages,
  currentUserId,
  addConvo,
  setConversationId,
  socket,
  setUnread,
  fetchMessages,
  clearUnread,
  updateConversation,
}: UseMiniChatConversationSyncParams) => {
  const resolvingRef = useRef(false);
  const loadedConversationRef = useRef<string | null>(null);

  const conversationId = windowItem?.conversationId || null;
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
  }, [addConvo, conversations, setConversationId, socket, windowItem]);

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

  return {
    conversationId,
    unreadCount,
  };
};

const sendMiniChatMessage = async ({
  userId,
  conversationId,
  setDraft,
  setImagePreview,
  sendDirectMessage,
}: {
  userId: string;
  conversationId: string | null;
  setDraft: MiniChatDockStoreSnapshot["setDraft"];
  setImagePreview: MiniChatDockStoreSnapshot["setImagePreview"];
  sendDirectMessage: ChatStoreSnapshot["sendDirectMessage"];
}) => {
  // Read directly from the store to guarantee we don't accidentally double-send
  // if React hasn't flushed the closure state yet.
  const currentWindow = useMiniChatDockStore.getState().windows.find((windowRef) => windowRef.userId === userId);
  if (!currentWindow) {
    return;
  }

  const content = currentWindow.draft.trim();
  if (!content && !currentWindow.imagePreview) {
    return;
  }

  // Immediately clear store state so subsequent sync reads observe latest values.
  setDraft(userId, "");
  const imgUrl = currentWindow.imagePreview || undefined;
  setImagePreview(userId, null);

  await sendDirectMessage(
    userId,
    content,
    imgUrl,
    undefined,
    conversationId || undefined,
  );
};

const handleMiniChatImageSelect = (
  event: React.ChangeEvent<HTMLInputElement>,
  userId: string,
  setImagePreview: MiniChatDockStoreSnapshot["setImagePreview"],
) => {
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

    setImagePreview(userId, reader.result);
  };
  reader.readAsDataURL(file);
};

const handleMiniChatInputKeyDown = (
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  onSend: () => Promise<void>,
) => {
  if (event.nativeEvent.isComposing) {
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void onSend();
  }
};

const openMiniChatInFullView = ({
  conversationId,
  setActiveConversation,
  navigate,
}: {
  conversationId: string | null;
  setActiveConversation: ChatStoreSnapshot["setActiveConversation"];
  navigate: NavigateFunction;
}) => {
  if (conversationId) {
    setActiveConversation(conversationId);
  }

  navigate("/");
};

const startMiniChatResize = ({
  event,
  windowItem,
  setPoppedHeight,
  resizeStartYRef,
  resizeStartHeightRef,
}: {
  event: React.PointerEvent<HTMLButtonElement>;
  windowItem: MiniChatDockWindow;
  setPoppedHeight: MiniChatDockStoreSnapshot["setPoppedHeight"];
  resizeStartYRef: { current: number };
  resizeStartHeightRef: { current: number };
}) => {
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

type MiniChatMessagesProps = {
  conversationId: string | null;
  currentMessages: Message[];
  currentUserId: string;
  displayName: string;
  poppedOut: boolean;
  poppedHeight: number;
  listRef: React.RefObject<HTMLDivElement | null>;
  onRetryMessage: (conversationId: string, messageId: string) => void;
};

const MiniChatMessages = ({
  conversationId,
  currentMessages,
  currentUserId,
  displayName,
  poppedOut,
  poppedHeight,
  listRef,
  onRetryMessage,
}: MiniChatMessagesProps) => {
  const containerStyle = poppedOut
    ? { height: `${Math.max(poppedHeight - 150, 240)}px` }
    : undefined;

  const messageContent = (() => {
    if (!conversationId) {
      return (
        <div className="flex-1 flex flex-col justify-end w-full overflow-hidden pb-1">
          <MiniChatSkeleton />
        </div>
      );
    }

    if (currentMessages.length > 0) {
      return currentMessages.slice(-18).map((messageItem) => {
        const ownMessage =
          messageItem.isOwn ?? String(messageItem.senderId) === String(currentUserId);
        const animateClass = ownMessage
          ? "animate-in fade-in slide-in-from-bottom-1 duration-200"
          : "animate-in fade-in slide-in-from-left-1 duration-200";
        const deliveryLabel = ownMessage ? getMiniChatDeliveryLabel(messageItem) : "";
        const canRetry =
          ownMessage &&
          Boolean(conversationId) &&
          String(messageItem._id || "").startsWith("temp-") &&
          (messageItem.deliveryState === "queued" || messageItem.deliveryState === "failed");

        return (
          <article
            key={messageItem._id}
            className={`social-mini-chat-msg ${ownMessage ? "social-mini-chat-msg--own" : ""}`}
          >
            <div className={`social-mini-chat-bubble ${animateClass}`}>
              {messageItem.content || (messageItem.imgUrl ? "" : "(Attachment)")}
              {messageItem.imgUrl ? (
                <img
                  src={messageItem.imgUrl}
                  alt="Message media"
                  className="social-mini-chat-media"
                />
              ) : null}
            </div>

            <div className="social-mini-chat-meta-row">
              <span className="social-mini-chat-time">{formatMessageTime(messageItem.createdAt)}</span>

              {deliveryLabel && (
                <span
                  className={cn(
                    "social-mini-chat-delivery-badge",
                    messageItem.deliveryState === "sending" &&
                      "social-mini-chat-delivery-badge--sending",
                    messageItem.deliveryState === "queued" &&
                      "social-mini-chat-delivery-badge--queued",
                    messageItem.deliveryState === "failed" &&
                      "social-mini-chat-delivery-badge--failed",
                  )}
                >
                  {messageItem.deliveryState === "sending" && (
                    <LoaderCircle className="h-2.5 w-2.5 animate-spin" />
                  )}
                  {messageItem.deliveryState === "queued" && (
                    <Clock3 className="h-2.5 w-2.5" />
                  )}
                  {messageItem.deliveryState === "failed" && (
                    <AlertCircle className="h-2.5 w-2.5" />
                  )}
                  {deliveryLabel}
                </span>
              )}

              {canRetry && conversationId ? (
                <button
                  type="button"
                  className="social-mini-chat-retry"
                  onClick={() => onRetryMessage(conversationId, messageItem._id)}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  Retry
                </button>
              ) : null}
            </div>
          </article>
        );
      });
    }

    return (
      <div className="flex flex-col items-center justify-center gap-2.5 text-center my-auto py-6 px-3">
        <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary/8">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="absolute inset-0 rounded-full border border-primary/20 opacity-40" />
        </div>
        <p className="social-mini-chat-state text-[13px] font-medium">
          Say hi to {displayName.split(" ")[0]}.
        </p>
      </div>
    );
  })();

  return (
    <div
      ref={listRef}
      className="social-mini-chat-messages beautiful-scrollbar"
      style={containerStyle}
    >
      {messageContent}
    </div>
  );
};

type MiniChatWindowHeaderProps = {
  windowItem: MiniChatDockWindow;
  shouldPulse: boolean;
  presence: string | undefined;
  presenceLabel: string;
  conversationId: string | null;
  toggleMinimized: MiniChatDockStoreSnapshot["toggleMinimized"];
  togglePinned: MiniChatDockStoreSnapshot["togglePinned"];
  togglePoppedOut: MiniChatDockStoreSnapshot["togglePoppedOut"];
  closeWindow: MiniChatDockStoreSnapshot["closeWindow"];
  setActiveConversation: ChatStoreSnapshot["setActiveConversation"];
  navigate: NavigateFunction;
};

const MiniChatWindowHeader = ({
  windowItem,
  shouldPulse,
  presence,
  presenceLabel,
  conversationId,
  toggleMinimized,
  togglePinned,
  togglePoppedOut,
  closeWindow,
  setActiveConversation,
  navigate,
}: MiniChatWindowHeaderProps) => {
  return (
    <header className={`social-mini-chat-head ${shouldPulse ? "social-mini-chat-head--pulse" : ""}`}>
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
              background: presence === "online"
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
          onClick={() => openMiniChatInFullView({ conversationId, setActiveConversation, navigate })}
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
  );
};

const MiniChatWindow = ({
  userId,
  onReorder,
  isFocused,
}: {
  userId: string;
  onReorder: MiniChatDockStoreSnapshot["reorderWindows"];
  isFocused: boolean;
}) => {
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
    retryMessageDelivery,
    addConvo,
    updateConversation,
    setActiveConversation,
  } = useChatStore();
  const { socket, getUserPresence } = useSocketStore();
  const currentUserId = useAuthStore((state) => state.user?._id || "");

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);

  const { conversationId } = useMiniChatConversationSync({
    windowItem,
    conversations,
    messages,
    currentUserId,
    addConvo,
    setConversationId,
    socket,
    setUnread,
    fetchMessages,
    clearUnread,
    updateConversation,
  });

  const currentMessages = useMemo(
    () => (conversationId ? messages[conversationId]?.items || [] : []),
    [conversationId, messages],
  );

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
  const presenceLabel = getPresenceLabel(presence);

  const handleSend = () => {
    return sendMiniChatMessage({
      userId,
      conversationId,
      setDraft,
      setImagePreview,
      sendDirectMessage,
    });
  };

  const handleRetryMessage = (targetConversationId: string, messageId: string) => {
    void retryMessageDelivery(targetConversationId, messageId);
  };

  const shouldPulse = windowItem.pulseUntil > Date.now();

  return (
    <section
      className={cn(
        "social-mini-chat-window mini-chat-bounce-in",
        windowItem.poppedOut ? "social-mini-chat-window--popped" : "",
        windowItem.minimized && windowItem.unreadCount > 0 ? "mini-chat-flash-unread" : "",
        isFocused ? "social-mini-chat-window--focused" : ""
      )}
      aria-label={`Chat with ${windowItem.displayName}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", windowItem.userId);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const draggedUserId = event.dataTransfer.getData("text/plain");
        onReorder(draggedUserId, windowItem.userId);
      }}
    >
      <MiniChatWindowHeader
        windowItem={windowItem}
        shouldPulse={shouldPulse}
        presence={presence}
        presenceLabel={presenceLabel}
        conversationId={conversationId}
        toggleMinimized={toggleMinimized}
        togglePinned={togglePinned}
        togglePoppedOut={togglePoppedOut}
        closeWindow={closeWindow}
        setActiveConversation={setActiveConversation}
        navigate={navigate}
      />

      {windowItem.minimized ? null : (
        <>
          <MiniChatMessages
            conversationId={conversationId}
            currentMessages={currentMessages}
            currentUserId={currentUserId}
            displayName={windowItem.displayName}
            poppedOut={windowItem.poppedOut}
            poppedHeight={windowItem.poppedHeight || 500}
            listRef={listRef}
            onRetryMessage={handleRetryMessage}
          />

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
                onChange={(event) => handleMiniChatImageSelect(event, windowItem.userId, setImagePreview)}
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
                  onKeyDown={(event) => handleMiniChatInputKeyDown(event, handleSend)}
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
              onPointerDown={(event) =>
                startMiniChatResize({
                  event,
                  windowItem,
                  setPoppedHeight,
                  resizeStartYRef,
                  resizeStartHeightRef,
                })
              }
            />
          ) : null}
        </>
      )}
    </section>
  );
};

const SocialMiniChatDock = () => {
  const windows = useMiniChatDockStore((state) => state.windows);
  const minimizeAll = useMiniChatDockStore((state) => state.minimizeAll);
   
  const focusNextWindow = useMiniChatDockStore((state) => state.focusNextWindow);
   
  const focusPreviousWindow = useMiniChatDockStore((state) => state.focusPreviousWindow);
   
  const closeFocusedWindow = useMiniChatDockStore((state) => state.closeFocusedWindow);
  const reorderWindows = useMiniChatDockStore((state) => state.reorderWindows);
  const focusWindow = useMiniChatDockStore((state) => state.focusWindow);
  const closeWindow = useMiniChatDockStore((state) => state.closeWindow);
  const focusedWindowId = useMiniChatDockStore((state) => state.focusedWindowId);
  const expandedWindows = useMemo(
    () => windows.filter((windowItem) => !windowItem.minimized),
    [windows],
  );
  const collapsedWindows = useMemo(
    () => windows.filter((windowItem) => windowItem.minimized),
    [windows],
  );
  const totalUnread = useMemo(
    () => windows.reduce((sum, windowItem) => sum + (windowItem.unreadCount || 0), 0),
    [windows],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = isMiniChatShortcut(event);
      if (!shortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      switch (shortcut) {
        case "focusNext":
          focusNextWindow();
          break;
        case "focusPrevious":
          focusPreviousWindow();
          break;
        case "closeFocused":
          closeFocusedWindow();
          break;
        case "minimizeAll":
          minimizeAll();
          break;
        default:
          break;
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusNextWindow, focusPreviousWindow, closeFocusedWindow, minimizeAll]);

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
          title={`Mini chat shortcuts: ${MINI_CHAT_KEYBOARD_SHORTCUTS.focusNext} (next), ${MINI_CHAT_KEYBOARD_SHORTCUTS.focusPrevious} (previous), ${MINI_CHAT_KEYBOARD_SHORTCUTS.closeFocused} (close), ${MINI_CHAT_KEYBOARD_SHORTCUTS.minimizeAll} (minimize all)`}
        >
          <MessageCircle className="h-4 w-4" />
          Chats ({windows.length})
          {collapsedWindows.length > 0 ? (
            <span className="social-mini-chat-overview-meta">
              {expandedWindows.length} open
            </span>
          ) : null}
          {totalUnread > 0 ? (
            <span className="social-mini-chat-overview-unread">{totalUnread}</span>
          ) : null}
        </Button>
      </div>

      {collapsedWindows.length > 0 ? (
        <div className="social-mini-chat-collapsed-strip" role="tablist" aria-label="Collapsed mini chats">
          {collapsedWindows.map((windowItem) => {
            const shouldPulse = windowItem.pulseUntil > Date.now();

            return (
              <div
                key={windowItem.userId}
                className={cn(
                  "social-mini-chat-collapsed-tab",
                  shouldPulse && "social-mini-chat-collapsed-tab--pulse",
                )}
              >
                <button
                  type="button"
                  className="social-mini-chat-collapsed-main"
                  onClick={() => focusWindow(windowItem.userId)}
                >
                  <UserAvatar
                    type="chat"
                    name={windowItem.displayName}
                    avatarUrl={windowItem.avatarUrl}
                    className="social-mini-chat-collapsed-avatar"
                  />

                  <span className="social-mini-chat-collapsed-name">{windowItem.displayName}</span>

                  {windowItem.unreadCount > 0 ? (
                    <span className="social-mini-chat-collapsed-unread">
                      {windowItem.unreadCount > 99 ? "99+" : windowItem.unreadCount}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  className="social-mini-chat-collapsed-close"
                  onClick={() => closeWindow(windowItem.userId)}
                  aria-label={`Close ${windowItem.displayName} chat`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="social-mini-chat-dock">
        {expandedWindows.map((windowItem) => (
          <MiniChatWindow
            key={windowItem.userId}
            userId={windowItem.userId}
            onReorder={reorderWindows}
            isFocused={focusedWindowId === windowItem.userId}
          />
        ))}
      </div>
    </div>
  );
};

export default SocialMiniChatDock;
