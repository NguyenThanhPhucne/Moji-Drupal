import { useChatStore } from "@/stores/useChatStore";
import ChatWelcomeScreen from "./ChatWelcomeScreen";
import MessageItem from "./MessageItem";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { useSocketStore } from "@/stores/useSocketStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { ChevronDown, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Message } from "@/types/chat";

function isSameDay(a: string, b: string) {
  return (
    format(new Date(a), "yyyy-MM-dd") === format(new Date(b), "yyyy-MM-dd")
  );
}

interface TypingEventPayload {
  conversationId: string;
  userId: string;
  displayName?: string;
}

const EMPTY_MESSAGES: Message[] = [];

const getMessageRenderKey = (message: Message) => {
  if (message._id) {
    return message._id;
  }

  return [
    "pending",
    message.conversationId,
    message.senderId,
    message.createdAt,
    message.updatedAt ?? "",
    message.imgUrl ?? "",
    message.replyTo?._id ?? "",
    message.content ?? "",
  ].join("::");
};

const ChatWindowBody = () => {
  const {
    activeConversationId,
    conversations,
    messages: allMessages,
    fetchMessages,
  } = useChatStore();
  const { socket } = useSocketStore();
  const { user: currentUser } = useAuthStore();

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const messages = useMemo(() => {
    if (!activeConversationId) {
      return EMPTY_MESSAGES;
    }

    return allMessages[activeConversationId]?.items ?? EMPTY_MESSAGES;
  }, [allMessages, activeConversationId]);
  const reversedMessages = [...messages].reverse();
  const hasMore = allMessages[activeConversationId!]?.hasMore ?? false;
  const selectedConvo = conversations.find(
    (c) => c._id === activeConversationId,
  );
  const key = `chat-scroll-${activeConversationId}`;

  const myId = useMemo(
    () => (currentUser?._id ? String(currentUser._id) : ""),
    [currentUser?._id],
  );

  const lastOwnMessage = useMemo(() => {
    if (!myId || messages.length === 0) {
      return null;
    }

    return (
      [...messages]
        .reverse()
        .find(
          (messageItem) =>
            messageItem.senderId === myId && !messageItem.isDeleted,
        ) ?? null
    );
  }, [messages, myId]);

  const lastMessageStatus = useMemo<"delivered" | "seen">(() => {
    if (!myId || !lastOwnMessage) {
      return "delivered";
    }

    const readByOthers = (lastOwnMessage.readBy ?? [])
      .map(String)
      .filter((readerId: string) => readerId !== myId);

    if (readByOthers.length > 0) {
      return "seen";
    }

    const seenByOthers = (selectedConvo?.seenBy ?? [])
      .map((seenUser) =>
        typeof seenUser === "string" ? seenUser : String(seenUser._id),
      )
      .filter((seenUserId) => seenUserId !== myId);

    const isConversationLastMessage =
      selectedConvo?.lastMessage?._id === lastOwnMessage._id;

    return isConversationLastMessage && seenByOthers.length > 0
      ? "seen"
      : "delivered";
  }, [
    myId,
    lastOwnMessage,
    selectedConvo?.lastMessage?._id,
    selectedConvo?.seenBy,
  ]);

  const directSeenUser = useMemo(() => {
    if (selectedConvo?.type !== "direct" || !myId) {
      return null;
    }

    const partner = selectedConvo.participants.find(
      (participant) => String(participant._id) !== myId,
    );

    if (!partner) {
      return null;
    }

    const seenPartner = (selectedConvo.seenBy ?? []).find(
      (seenUser) => String(seenUser._id) === String(partner._id),
    );

    return {
      _id: String(partner._id),
      displayName: seenPartner?.displayName || partner.displayName,
      avatarUrl: seenPartner?.avatarUrl ?? partner.avatarUrl ?? null,
    };
  }, [selectedConvo, myId]);

  const groupSeenUsers = useMemo(() => {
    if (selectedConvo?.type !== "group" || !myId) {
      return [] as Array<{
        _id: string;
        displayName?: string;
        avatarUrl?: string | null;
      }>;
    }

    const participantsById = new Map(
      (selectedConvo.participants ?? []).map((participant) => [
        String(participant._id),
        participant,
      ]),
    );

    return (selectedConvo.seenBy ?? []).reduce<
      Array<{
        _id: string;
        displayName?: string;
        avatarUrl?: string | null;
      }>
    >((acc, seenUser) => {
      const seenUserId =
        typeof seenUser === "string" ? seenUser : String(seenUser._id);
      const participant = participantsById.get(seenUserId);

      if (seenUserId === myId || !participant) {
        return acc;
      }

      acc.push({
        _id: seenUserId,
        displayName:
          typeof seenUser === "string"
            ? participant.displayName
            : (seenUser.displayName ?? participant.displayName),
        avatarUrl:
          typeof seenUser === "string"
            ? participant.avatarUrl
            : (seenUser.avatarUrl ?? participant.avatarUrl),
      });

      return acc;
    }, []);
  }, [selectedConvo, myId]);

  // Fetch initial messages if not present
  useEffect(() => {
    if (
      activeConversationId &&
      !allMessages[activeConversationId]?.items?.length
    ) {
      fetchMessages(activeConversationId).catch((err) =>
        console.error("Error fetching initial messages:", err),
      );
    }
  }, [activeConversationId, fetchMessages, allMessages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto mark as seen when the latest incoming message is visible in active chat.
  useEffect(() => {
    if (!activeConversationId || !selectedConvo || !currentUser?._id) {
      return;
    }

    const newestMessage = messages.at(-1);
    if (!newestMessage || newestMessage.senderId === currentUser._id) {
      return;
    }

    const myUnread = selectedConvo.unreadCounts?.[currentUser._id] ?? 0;
    if (myUnread <= 0) {
      return;
    }

    const timer = globalThis.setTimeout(() => {
      useChatStore.getState().markAsSeen();
    }, 200);

    return () => globalThis.clearTimeout(timer);
  }, [activeConversationId, currentUser?._id, messages, selectedConvo]);

  // Typing indicator via socket
  useEffect(() => {
    if (!socket || !activeConversationId) return;

    const handleTyping = ({
      conversationId,
      userId,
      displayName,
    }: TypingEventPayload) => {
      if (
        conversationId === activeConversationId &&
        userId !== currentUser?._id
      ) {
        setTypingUsers((prev) => ({
          ...prev,
          [userId]: displayName || "Someone",
        }));
      }
    };
    const handleStopTyping = ({
      conversationId,
      userId,
    }: TypingEventPayload) => {
      if (conversationId === activeConversationId) {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
      }
    };

    socket.on("user-typing", handleTyping);
    socket.on("user-stop_typing", handleStopTyping);
    return () => {
      socket.off("user-typing", handleTyping);
      socket.off("user-stop_typing", handleStopTyping);
    };
  }, [socket, activeConversationId, currentUser]);

  // Scroll to bottom or saved position when conversation changes
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const item = sessionStorage.getItem(key);
    if (item) {
      const { scrollTop } = JSON.parse(item);
      requestAnimationFrame(() => {
        container.scrollTop = scrollTop;
      });
    } else {
      container.scrollTop = 0; // bottom in column-reverse
    }
    prevMsgLength.current = messages.length;
  }, [activeConversationId, key, messages.length]);

  // Auto-scroll logic when new messages arrive
  const prevMsgLength = useRef(messages.length);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (messages.length > prevMsgLength.current) {
      const newestMsg = messages.at(-1);
      const isSentByMe = newestMsg?.senderId === currentUser?._id;

      // Force scroll to bottom if I sent it, OR if I'm already within 150px of the bottom reading
      if (isSentByMe || container.scrollTop < 150) {
        requestAnimationFrame(() => {
          container.scrollTop = 0;
        });
        setShowScrollBtn(false);
      }
    }
    prevMsgLength.current = messages.length;
  }, [messages, currentUser?._id]);

  const handleScrollSave = useCallback(() => {
    const container = containerRef.current;
    if (!container || !activeConversationId) return;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      }),
    );
    // Show scroll-to-bottom button when far from bottom
    const distFromBottom = Math.abs(container.scrollTop);
    setShowScrollBtn(distFromBottom > 300);
  }, [activeConversationId, key]);

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    setShowScrollBtn(false);
  };

  const fetchMoreMessages = async () => {
    if (!activeConversationId) return;
    try {
      await fetchMessages(activeConversationId);
    } catch (error) {
      console.error("Error loading more messages:", error);
    }
  };

  if (!selectedConvo) return <ChatWelcomeScreen />;

  if (!messages?.length) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-4 text-muted-foreground px-8 text-center bg-primary-foreground">
        <div className="size-16 rounded-full bg-muted flex items-center justify-center animate-bounce">
          <MessageCircle className="size-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs">
          Send the first message to start the conversation!
        </p>
      </div>
    );
  }

  return (
    <div
      key={`chat-conversation-${activeConversationId}`}
      className="conversation-fade p-2 bg-primary-foreground h-full flex flex-col overflow-hidden relative"
    >
      <div
        id="scrollableDiv"
        ref={containerRef}
        onScroll={handleScrollSave}
        className="flex flex-col-reverse overflow-y-auto overflow-x-hidden beautiful-scrollbar flex-1"
      >
        <div ref={messagesEndRef} />

        {/* Typing indicator */}
        {Object.values(typingUsers).length > 0 && (
          <div className="flex items-center gap-2 px-4 py-1 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex bg-muted/70 rounded-2xl rounded-bl-sm px-3 py-2 gap-1.5 items-center w-fit shadow-sm">
              <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" />
            </div>
            <span className="text-xs text-muted-foreground">
              {Object.values(typingUsers).join(", ")} is typing...
            </span>
          </div>
        )}

        <InfiniteScroll
          dataLength={messages.length}
          next={fetchMoreMessages}
          hasMore={hasMore}
          scrollableTarget="scrollableDiv"
          loader={
            <div className="flex justify-center py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" />
              </div>
            </div>
          }
          inverse={true}
          style={{
            display: "flex",
            flexDirection: "column-reverse",
            overflow: "visible",
          }}
        >
          {reversedMessages.map((message, index) => {
            const prevMessage = reversedMessages[index + 1];
            const showDateDivider =
              !prevMessage ||
              !isSameDay(message.createdAt, prevMessage.createdAt);
            return (
              <MessageItem
                key={getMessageRenderKey(message)}
                message={message}
                index={index}
                messages={reversedMessages}
                selectedConvo={selectedConvo}
                lastMessageStatus={lastMessageStatus}
                lastOwnMessageId={lastOwnMessage?._id ?? null}
                seenUser={directSeenUser}
                seenUsers={groupSeenUsers}
                showDateDivider={showDateDivider}
                isNew={index === 0}
              />
            );
          })}
        </InfiniteScroll>
      </div>

      {/* Scroll to bottom FAB */}
      <button
        onClick={scrollToBottom}
        className={cn(
          "absolute bottom-4 right-4 size-10 rounded-full bg-background border border-border/70 shadow-lg flex items-center justify-center transition-all duration-300 hover:bg-muted/70 z-20",
          showScrollBtn
            ? "opacity-100 scale-100"
            : "opacity-0 scale-75 pointer-events-none",
        )}
        title="Scroll down"
      >
        <ChevronDown className="size-5 text-muted-foreground" />
      </button>
    </div>
  );
};

export default ChatWindowBody;
